"""
MaterialAIService - AI-powered materials intelligence.
Provides predictive analytics, anomaly detection, and smart recommendations
for material inventory management.
"""

from datetime import datetime, timedelta, date
from app.extensions import db
from app.models import Material
from app.models.stock_history import StockHistory
from app.models.material_batch import MaterialBatch
from app.models.material_vendor import MaterialVendor
from app.models.stock_reservation import StockReservation
from app.models.vendor import Vendor
from sqlalchemy import func, and_, or_, desc
import statistics
import logging

logger = logging.getLogger(__name__)


class MaterialAIService:
    """AI-powered materials intelligence"""

    def predict_reorder_date(self, material_id: int) -> dict:
        """
        Predict when material will need reordering based on consumption patterns.
        Returns: {
            'predicted_date': '2026-02-20',
            'confidence': 0.85,
            'days_until_reorder': 11,
            'avg_daily_usage': 2.5,
            'reasoning': 'Based on 30-day average consumption'
        }
        """
        material = db.session.get(Material, material_id)
        if not material:
            return {'error': 'Material not found'}

        # Get consumption history for last 30 days
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        consumption = db.session.query(
            func.sum(func.abs(StockHistory.quantity_change))
        ).filter(
            StockHistory.material_id == material_id,
            StockHistory.change_type == 'consume',
            StockHistory.created_at >= thirty_days_ago
        ).scalar() or 0

        # Calculate average daily usage
        avg_daily_usage = consumption / 30.0

        if avg_daily_usage <= 0:
            return {
                'predicted_date': None,
                'confidence': 0.5,
                'days_until_reorder': None,
                'avg_daily_usage': 0,
                'reasoning': 'No consumption history in last 30 days'
            }

        # Get available stock (current - reserved)
        reserved = db.session.query(
            func.sum(StockReservation.quantity)
        ).filter(
            StockReservation.material_id == material_id,
            StockReservation.status == 'active'
        ).scalar() or 0

        available_stock = material.current_stock - reserved

        # Calculate days until reorder point (min_stock)
        stock_above_min = available_stock - material.min_stock
        if stock_above_min <= 0:
            days_until_reorder = 0
            predicted_date = date.today()
        else:
            days_until_reorder = int(stock_above_min / avg_daily_usage)
            predicted_date = date.today() + timedelta(days=days_until_reorder)

        # Confidence based on data availability
        consumption_records = StockHistory.query.filter(
            StockHistory.material_id == material_id,
            StockHistory.change_type == 'consume',
            StockHistory.created_at >= thirty_days_ago
        ).count()

        # More records = higher confidence
        confidence = min(0.95, 0.5 + (consumption_records * 0.05))

        return {
            'predicted_date': predicted_date.isoformat() if predicted_date else None,
            'confidence': round(confidence, 2),
            'days_until_reorder': days_until_reorder,
            'avg_daily_usage': round(avg_daily_usage, 2),
            'reasoning': f'Based on 30-day average consumption ({consumption_records} records)'
        }

    def forecast_demand(self, material_id: int, days: int = 30) -> dict:
        """
        Forecast demand for next N days.
        Returns: {
            'forecast_quantity': 75,
            'confidence': 0.8,
            'daily_forecast': [2.5, 2.5, 3.0, ...],
            'factors': ['seasonal_adjustment', 'work_plan_scheduled']
        }
        """
        material = db.session.get(Material, material_id)
        if not material:
            return {'error': 'Material not found'}

        # Get historical consumption data
        ninety_days_ago = datetime.utcnow() - timedelta(days=90)
        history = db.session.query(
            func.date(StockHistory.created_at).label('date'),
            func.sum(func.abs(StockHistory.quantity_change)).label('consumption')
        ).filter(
            StockHistory.material_id == material_id,
            StockHistory.change_type == 'consume',
            StockHistory.created_at >= ninety_days_ago
        ).group_by(
            func.date(StockHistory.created_at)
        ).all()

        if not history:
            return {
                'forecast_quantity': 0,
                'confidence': 0.3,
                'daily_forecast': [0] * days,
                'factors': ['no_historical_data']
            }

        daily_consumptions = [float(h.consumption) for h in history]
        avg_daily = statistics.mean(daily_consumptions) if daily_consumptions else 0

        # Calculate variance for confidence
        if len(daily_consumptions) >= 2:
            std_dev = statistics.stdev(daily_consumptions)
            # Lower variance = higher confidence
            cv = std_dev / avg_daily if avg_daily > 0 else 1
            confidence = max(0.4, min(0.95, 1.0 - cv))
        else:
            confidence = 0.5

        # Generate daily forecast with some variation
        daily_forecast = []
        factors = []

        # Check for upcoming work plans that need this material
        from app.models.work_plan_material import WorkPlanMaterial
        from app.models.work_plan_job import WorkPlanJob
        from app.models.work_plan_day import WorkPlanDay

        today = date.today()
        future_date = today + timedelta(days=days)

        scheduled_qty = db.session.query(
            func.sum(WorkPlanMaterial.quantity_required)
        ).join(
            WorkPlanJob, WorkPlanMaterial.work_plan_job_id == WorkPlanJob.id
        ).join(
            WorkPlanDay, WorkPlanJob.work_plan_day_id == WorkPlanDay.id
        ).filter(
            WorkPlanMaterial.material_id == material_id,
            WorkPlanDay.date >= today,
            WorkPlanDay.date <= future_date
        ).scalar() or 0

        if scheduled_qty > 0:
            factors.append('work_plan_scheduled')

        # Simple forecast: use average with slight random variation
        for i in range(days):
            # Add 10% variation
            daily_value = avg_daily * (0.9 + (i % 3) * 0.1)
            daily_forecast.append(round(daily_value, 2))

        forecast_quantity = sum(daily_forecast) + float(scheduled_qty)

        if not factors:
            factors.append('historical_average')

        return {
            'forecast_quantity': round(forecast_quantity, 2),
            'confidence': round(confidence, 2),
            'daily_forecast': daily_forecast[:days],
            'factors': factors
        }

    def detect_consumption_anomalies(self, material_id: int = None) -> list:
        """
        Detect unusual consumption patterns.
        Returns: [
            {
                'material_id': 1,
                'material_name': 'Hydraulic Oil',
                'anomaly_type': 'spike',
                'severity': 'high',
                'details': 'Usage 300% above normal on Feb 5',
                'recommendation': 'Verify with maintenance team'
            }
        ]
        """
        anomalies = []

        # Query materials to check
        if material_id:
            materials = [db.session.get(Material, material_id)]
        else:
            materials = Material.query.filter_by(is_active=True).all()

        for material in materials:
            if not material:
                continue

            # Get daily consumption for last 30 days
            thirty_days_ago = datetime.utcnow() - timedelta(days=30)
            daily_consumption = db.session.query(
                func.date(StockHistory.created_at).label('date'),
                func.sum(func.abs(StockHistory.quantity_change)).label('consumption')
            ).filter(
                StockHistory.material_id == material.id,
                StockHistory.change_type == 'consume',
                StockHistory.created_at >= thirty_days_ago
            ).group_by(
                func.date(StockHistory.created_at)
            ).all()

            if len(daily_consumption) < 5:
                continue

            consumptions = [float(d.consumption) for d in daily_consumption]
            avg = statistics.mean(consumptions)

            if len(consumptions) >= 2:
                std_dev = statistics.stdev(consumptions)
            else:
                continue

            if avg == 0 or std_dev == 0:
                continue

            # Check for anomalies (2+ standard deviations from mean)
            for record in daily_consumption:
                consumption = float(record.consumption)
                z_score = (consumption - avg) / std_dev if std_dev > 0 else 0

                if abs(z_score) >= 2:
                    if z_score > 0:
                        anomaly_type = 'spike'
                        severity = 'high' if z_score >= 3 else 'medium'
                        pct_above = int((consumption / avg - 1) * 100)
                        details = f'Usage {pct_above}% above normal on {record.date}'
                        recommendation = 'Verify with maintenance team for unusual activity'
                    else:
                        anomaly_type = 'drop'
                        severity = 'medium' if z_score <= -3 else 'low'
                        pct_below = int((1 - consumption / avg) * 100)
                        details = f'Usage {pct_below}% below normal on {record.date}'
                        recommendation = 'Check if operations are running normally'

                    anomalies.append({
                        'material_id': material.id,
                        'material_name': material.name,
                        'anomaly_type': anomaly_type,
                        'severity': severity,
                        'details': details,
                        'recommendation': recommendation
                    })

        return anomalies

    def calculate_optimal_reorder_point(self, material_id: int) -> dict:
        """
        AI calculates optimal reorder point based on:
        - Average daily usage
        - Lead time
        - Safety stock needs
        - Usage variability
        Returns: {
            'recommended_reorder_point': 50,
            'recommended_reorder_qty': 100,
            'recommended_safety_stock': 20,
            'reasoning': 'Based on 15-day lead time and 2.5 daily usage'
        }
        """
        material = db.session.get(Material, material_id)
        if not material:
            return {'error': 'Material not found'}

        # Get consumption data for last 60 days
        sixty_days_ago = datetime.utcnow() - timedelta(days=60)
        daily_consumption = db.session.query(
            func.date(StockHistory.created_at).label('date'),
            func.sum(func.abs(StockHistory.quantity_change)).label('consumption')
        ).filter(
            StockHistory.material_id == material_id,
            StockHistory.change_type == 'consume',
            StockHistory.created_at >= sixty_days_ago
        ).group_by(
            func.date(StockHistory.created_at)
        ).all()

        if not daily_consumption:
            return {
                'recommended_reorder_point': material.min_stock or 10,
                'recommended_reorder_qty': 50,
                'recommended_safety_stock': 10,
                'reasoning': 'Using defaults due to no consumption history'
            }

        consumptions = [float(d.consumption) for d in daily_consumption]
        avg_daily = statistics.mean(consumptions)

        if len(consumptions) >= 2:
            std_dev = statistics.stdev(consumptions)
        else:
            std_dev = avg_daily * 0.2  # Assume 20% variation

        # Get lead time from preferred vendor
        vendor_link = MaterialVendor.query.filter_by(
            material_id=material_id,
            is_preferred=True
        ).first()

        if vendor_link and vendor_link.lead_time_days:
            lead_time = vendor_link.lead_time_days
        else:
            # Get average lead time from all vendors
            avg_lead = db.session.query(
                func.avg(MaterialVendor.lead_time_days)
            ).filter(
                MaterialVendor.material_id == material_id,
                MaterialVendor.lead_time_days.isnot(None)
            ).scalar()
            lead_time = int(avg_lead) if avg_lead else 14  # Default 14 days

        # Safety stock = Z-score * std_dev * sqrt(lead_time)
        # Using Z=1.65 for 95% service level
        import math
        safety_stock = 1.65 * std_dev * math.sqrt(lead_time)

        # Reorder point = (avg_daily * lead_time) + safety_stock
        reorder_point = (avg_daily * lead_time) + safety_stock

        # Economic order quantity (simplified)
        # Aim for 30-60 days supply
        reorder_qty = avg_daily * 45

        return {
            'recommended_reorder_point': round(reorder_point, 0),
            'recommended_reorder_qty': round(reorder_qty, 0),
            'recommended_safety_stock': round(safety_stock, 0),
            'current_min_stock': material.min_stock,
            'avg_daily_usage': round(avg_daily, 2),
            'lead_time_days': lead_time,
            'reasoning': f'Based on {lead_time}-day lead time and {round(avg_daily, 2)} daily usage with 95% service level'
        }

    def suggest_cost_optimization(self) -> list:
        """
        AI suggests ways to reduce material costs.
        Returns: [
            {
                'suggestion': 'Bulk order Oil Filters (100 units) for 15% discount',
                'savings_estimate': 150.00,
                'materials': [1, 2, 3],
                'priority': 'high'
            }
        ]
        """
        suggestions = []

        # 1. Find materials with multiple vendors - suggest price comparison
        materials_multi_vendor = db.session.query(
            MaterialVendor.material_id,
            func.count(MaterialVendor.vendor_id).label('vendor_count'),
            func.min(MaterialVendor.unit_price).label('min_price'),
            func.max(MaterialVendor.unit_price).label('max_price')
        ).group_by(
            MaterialVendor.material_id
        ).having(
            func.count(MaterialVendor.vendor_id) > 1
        ).all()

        for mv in materials_multi_vendor:
            if mv.min_price and mv.max_price and mv.max_price > mv.min_price:
                material = db.session.get(Material, mv.material_id)
                if material:
                    savings = (mv.max_price - mv.min_price) * (material.get_monthly_consumption() or 1)
                    if savings > 10:  # Only suggest if savings > $10
                        suggestions.append({
                            'suggestion': f'Switch to lower-cost vendor for {material.name} (save ${mv.max_price - mv.min_price:.2f}/unit)',
                            'savings_estimate': round(savings, 2),
                            'materials': [material.id],
                            'priority': 'high' if savings > 100 else 'medium'
                        })

        # 2. Find slow-moving items with high stock
        slow_movers = Material.query.filter(
            Material.is_active == True,
            Material.current_stock > Material.min_stock * 3
        ).all()

        for material in slow_movers:
            monthly = material.get_monthly_consumption()
            if monthly == 0 and material.current_stock > 0:
                # Get unit price
                vendor_link = MaterialVendor.query.filter_by(
                    material_id=material.id
                ).first()
                unit_price = vendor_link.unit_price if vendor_link else 10

                suggestions.append({
                    'suggestion': f'Reduce stock of {material.name} - no consumption in tracking period',
                    'savings_estimate': round(material.current_stock * unit_price * 0.1, 2),  # Carrying cost
                    'materials': [material.id],
                    'priority': 'medium'
                })

        # 3. Suggest bulk orders for high-usage items
        high_usage = Material.query.filter(
            Material.is_active == True
        ).all()

        for material in high_usage:
            monthly = material.get_monthly_consumption()
            if monthly > 20:  # High usage
                vendor_link = MaterialVendor.query.filter_by(
                    material_id=material.id
                ).first()
                if vendor_link and vendor_link.min_order_qty and vendor_link.unit_price:
                    if monthly * 3 >= vendor_link.min_order_qty:
                        # Estimate 10% bulk discount
                        savings = vendor_link.unit_price * monthly * 3 * 0.10
                        suggestions.append({
                            'suggestion': f'Bulk order {material.name} (3-month supply) for estimated 10% discount',
                            'savings_estimate': round(savings, 2),
                            'materials': [material.id],
                            'priority': 'medium'
                        })

        # Sort by savings
        suggestions.sort(key=lambda x: x['savings_estimate'], reverse=True)

        return suggestions[:10]  # Return top 10 suggestions

    def find_similar_materials(self, material_id: int) -> list:
        """
        Find similar/substitute materials.
        Returns: [
            {'material_id': 5, 'name': 'Generic Oil Filter', 'similarity': 0.95}
        ]
        """
        material = db.session.get(Material, material_id)
        if not material:
            return []

        similar = []

        # Find materials in same category
        same_category = Material.query.filter(
            Material.id != material_id,
            Material.category == material.category,
            Material.unit == material.unit,
            Material.is_active == True
        ).all()

        for m in same_category:
            # Calculate similarity based on name tokens
            name_tokens = set(material.name.lower().split())
            other_tokens = set(m.name.lower().split())

            if name_tokens and other_tokens:
                intersection = len(name_tokens & other_tokens)
                union = len(name_tokens | other_tokens)
                similarity = intersection / union if union > 0 else 0
            else:
                similarity = 0.5  # Same category at least

            if similarity >= 0.3:
                similar.append({
                    'material_id': m.id,
                    'code': m.code,
                    'name': m.name,
                    'category': m.category,
                    'current_stock': m.current_stock,
                    'similarity': round(similarity, 2)
                })

        # Sort by similarity
        similar.sort(key=lambda x: x['similarity'], reverse=True)

        return similar[:5]  # Return top 5

    def auto_categorize(self, name: str, description: str = None) -> dict:
        """
        AI categorizes a material based on name and description.
        Returns: {'category': 'filter', 'confidence': 0.9}
        """
        category_keywords = {
            'filter': ['filter', 'strainer', 'screen', 'element'],
            'lubricant': ['oil', 'grease', 'lubricant', 'lube'],
            'hydraulic': ['hydraulic', 'hose', 'cylinder', 'pump'],
            'electrical': ['wire', 'cable', 'fuse', 'breaker', 'switch', 'relay', 'sensor'],
            'mechanical': ['bearing', 'seal', 'gasket', 'bolt', 'nut', 'washer', 'gear'],
            'hvac': ['hvac', 'coolant', 'refrigerant', 'compressor', 'fan'],
            'safety': ['safety', 'ppe', 'glove', 'helmet', 'harness', 'goggles', 'vest'],
            'consumable': ['tape', 'adhesive', 'cleaner', 'solvent', 'rag', 'cloth'],
            'other': []
        }

        text = (name + ' ' + (description or '')).lower()

        best_category = 'spare_part'
        best_confidence = 0.5
        max_matches = 0

        for category, keywords in category_keywords.items():
            matches = sum(1 for kw in keywords if kw in text)
            if matches > max_matches:
                max_matches = matches
                best_category = category
                best_confidence = min(0.95, 0.6 + (matches * 0.15))

        return {
            'category': best_category,
            'confidence': round(best_confidence, 2)
        }

    def natural_language_search(self, query: str) -> dict:
        """
        Parse natural language search queries.
        'show low stock hydraulic items' -> filter by category and low_stock
        'what needs reordering' -> show items below reorder point
        Returns: {'filters': {...}, 'results': [...]}
        """
        query_lower = query.lower()
        filters = {}

        # Detect low stock queries
        if 'low stock' in query_lower or 'running low' in query_lower:
            filters['low_stock'] = True

        # Detect reorder queries
        if 'reorder' in query_lower or 'need to order' in query_lower:
            filters['needs_reorder'] = True

        # Detect category
        categories = ['lubricant', 'filter', 'hydraulic', 'electrical', 'mechanical', 'hvac', 'consumable', 'spare_part']
        for cat in categories:
            if cat in query_lower:
                filters['category'] = cat
                break

        # Detect expiring queries
        if 'expir' in query_lower:
            filters['expiring_soon'] = True

        # Build query
        query_obj = Material.query.filter_by(is_active=True)

        if filters.get('category'):
            query_obj = query_obj.filter(Material.category == filters['category'])

        materials = query_obj.all()
        results = []

        for m in materials:
            include = True

            if filters.get('low_stock') and not m.is_low_stock():
                include = False

            if filters.get('needs_reorder') and m.current_stock > m.min_stock:
                include = False

            if include:
                results.append(m.to_dict())

        # Handle expiring batches
        if filters.get('expiring_soon'):
            thirty_days = date.today() + timedelta(days=30)
            expiring = MaterialBatch.query.filter(
                MaterialBatch.expiry_date <= thirty_days,
                MaterialBatch.expiry_date >= date.today(),
                MaterialBatch.status == 'available',
                MaterialBatch.quantity > 0
            ).all()

            results = [{
                'material_id': b.material_id,
                'batch_number': b.batch_number,
                'expiry_date': b.expiry_date.isoformat(),
                'quantity': b.quantity,
                'days_until_expiry': b.days_until_expiry
            } for b in expiring]

        return {
            'query': query,
            'filters': filters,
            'results': results[:50]  # Limit results
        }

    def get_usage_insights(self, material_id: int = None) -> list:
        """
        AI-generated insights about material usage.
        Returns: [
            {'insight': 'Hydraulic Oil usage up 30% this month', 'type': 'trend'},
            {'insight': 'Oil Filters usage correlates with PM schedule', 'type': 'pattern'}
        ]
        """
        insights = []

        if material_id:
            materials = [db.session.get(Material, material_id)]
        else:
            materials = Material.query.filter_by(is_active=True).limit(20).all()

        for material in materials:
            if not material:
                continue

            # Compare this month to last month
            today = date.today()
            this_month_start = today.replace(day=1)
            last_month_start = (this_month_start - timedelta(days=1)).replace(day=1)

            this_month_consumption = db.session.query(
                func.sum(func.abs(StockHistory.quantity_change))
            ).filter(
                StockHistory.material_id == material.id,
                StockHistory.change_type == 'consume',
                StockHistory.created_at >= this_month_start
            ).scalar() or 0

            last_month_consumption = db.session.query(
                func.sum(func.abs(StockHistory.quantity_change))
            ).filter(
                StockHistory.material_id == material.id,
                StockHistory.change_type == 'consume',
                StockHistory.created_at >= last_month_start,
                StockHistory.created_at < this_month_start
            ).scalar() or 0

            if last_month_consumption > 0:
                change_pct = ((this_month_consumption - last_month_consumption) / last_month_consumption) * 100

                if abs(change_pct) >= 20:
                    direction = 'up' if change_pct > 0 else 'down'
                    insights.append({
                        'material_id': material.id,
                        'material_name': material.name,
                        'insight': f'{material.name} usage {direction} {abs(int(change_pct))}% this month',
                        'type': 'trend',
                        'change_percentage': round(change_pct, 1)
                    })

            # Check stock status
            stock_months = material.get_stock_months()
            if stock_months != float('inf') and stock_months < 2:
                insights.append({
                    'material_id': material.id,
                    'material_name': material.name,
                    'insight': f'{material.name} has only {round(stock_months, 1)} months of stock remaining',
                    'type': 'warning'
                })

        return insights

    def predict_expiry_risk(self) -> list:
        """
        Predict which batches are at risk of expiring before use.
        Returns list of at-risk batches with recommendations.
        """
        at_risk = []

        # Get batches with expiry dates
        batches = MaterialBatch.query.filter(
            MaterialBatch.expiry_date.isnot(None),
            MaterialBatch.status == 'available',
            MaterialBatch.quantity > 0
        ).all()

        for batch in batches:
            material = batch.material
            if not material:
                continue

            days_until_expiry = batch.days_until_expiry
            if days_until_expiry is None or days_until_expiry < 0:
                continue

            # Get average daily consumption
            monthly_consumption = material.get_monthly_consumption()
            daily_consumption = monthly_consumption / 30.0

            if daily_consumption > 0:
                days_to_consume = batch.quantity / daily_consumption

                if days_to_consume > days_until_expiry:
                    # Will expire before being used
                    excess_qty = (days_to_consume - days_until_expiry) * daily_consumption
                    risk_level = 'high' if days_until_expiry < 30 else 'medium'

                    at_risk.append({
                        'batch_id': batch.id,
                        'material_id': material.id,
                        'material_name': material.name,
                        'batch_number': batch.batch_number,
                        'quantity': batch.quantity,
                        'expiry_date': batch.expiry_date.isoformat(),
                        'days_until_expiry': days_until_expiry,
                        'days_to_consume': round(days_to_consume, 0),
                        'risk_level': risk_level,
                        'excess_quantity': round(excess_qty, 1),
                        'recommendation': 'Consider transferring to higher-consumption location or increasing usage'
                    })
            elif days_until_expiry < 90:
                # No consumption and expiring within 90 days
                at_risk.append({
                    'batch_id': batch.id,
                    'material_id': material.id,
                    'material_name': material.name,
                    'batch_number': batch.batch_number,
                    'quantity': batch.quantity,
                    'expiry_date': batch.expiry_date.isoformat(),
                    'days_until_expiry': days_until_expiry,
                    'risk_level': 'high' if days_until_expiry < 30 else 'medium',
                    'recommendation': 'No consumption history - consider using or disposing'
                })

        # Sort by days until expiry
        at_risk.sort(key=lambda x: x['days_until_expiry'])

        return at_risk

    def suggest_vendor(self, material_id: int) -> dict:
        """
        Recommend best vendor based on price, lead time, and reliability.
        Returns: {
            'recommended_vendor_id': 1,
            'vendor_name': 'ABC Supplies',
            'reasoning': 'Best price and 95% on-time delivery'
        }
        """
        vendor_links = MaterialVendor.query.filter_by(
            material_id=material_id
        ).all()

        if not vendor_links:
            return {
                'recommended_vendor_id': None,
                'vendor_name': None,
                'reasoning': 'No vendors configured for this material'
            }

        # Score each vendor
        scored_vendors = []

        for link in vendor_links:
            vendor = link.vendor
            if not vendor or not vendor.is_active:
                continue

            score = 0
            reasons = []

            # Price score (lower is better)
            if link.unit_price:
                min_price = min(v.unit_price for v in vendor_links if v.unit_price)
                if link.unit_price == min_price:
                    score += 40
                    reasons.append('best price')
                else:
                    price_ratio = min_price / link.unit_price
                    score += int(40 * price_ratio)

            # Lead time score (shorter is better)
            if link.lead_time_days:
                if link.lead_time_days <= 7:
                    score += 30
                    reasons.append('fast delivery')
                elif link.lead_time_days <= 14:
                    score += 20
                else:
                    score += 10

            # Vendor rating score
            if vendor.rating:
                score += int(vendor.rating * 6)  # Max 30 points
                if vendor.rating >= 4.5:
                    reasons.append(f'{vendor.rating} star rating')

            # Preferred vendor bonus
            if link.is_preferred:
                score += 10
                reasons.append('preferred vendor')

            scored_vendors.append({
                'vendor_id': vendor.id,
                'vendor_name': vendor.name,
                'score': score,
                'unit_price': link.unit_price,
                'lead_time_days': link.lead_time_days,
                'reasons': reasons
            })

        if not scored_vendors:
            return {
                'recommended_vendor_id': None,
                'vendor_name': None,
                'reasoning': 'No active vendors found'
            }

        # Get best vendor
        scored_vendors.sort(key=lambda x: x['score'], reverse=True)
        best = scored_vendors[0]

        return {
            'recommended_vendor_id': best['vendor_id'],
            'vendor_name': best['vendor_name'],
            'unit_price': best['unit_price'],
            'lead_time_days': best['lead_time_days'],
            'score': best['score'],
            'reasoning': ', '.join(best['reasons']) if best['reasons'] else 'Best overall score',
            'alternatives': scored_vendors[1:3]  # Show next 2 alternatives
        }

    def forecast_budget(self, days: int = 30) -> dict:
        """
        Forecast material spending for next N days.
        Returns: {
            'forecast_amount': 5000.00,
            'by_category': {'filter': 1000, 'lubricant': 2000, ...},
            'confidence': 0.75
        }
        """
        materials = Material.query.filter_by(is_active=True).all()

        total_forecast = 0
        by_category = {}

        for material in materials:
            # Forecast consumption
            demand = self.forecast_demand(material.id, days)
            forecast_qty = demand.get('forecast_quantity', 0)

            # Get unit price
            vendor_link = MaterialVendor.query.filter_by(
                material_id=material.id
            ).first()
            unit_price = vendor_link.unit_price if vendor_link and vendor_link.unit_price else 0

            forecast_cost = forecast_qty * unit_price
            total_forecast += forecast_cost

            category = material.category or 'other'
            by_category[category] = by_category.get(category, 0) + forecast_cost

        # Round values
        by_category = {k: round(v, 2) for k, v in by_category.items()}

        return {
            'forecast_amount': round(total_forecast, 2),
            'forecast_days': days,
            'by_category': by_category,
            'confidence': 0.7,
            'generated_at': datetime.utcnow().isoformat()
        }

    def get_abc_analysis(self) -> dict:
        """
        Classify materials by ABC analysis (value-based).
        A = 80% value, top 20% items
        B = 15% value, next 30% items
        C = 5% value, remaining 50% items
        Returns: {'A': [...], 'B': [...], 'C': [...]}
        """
        materials = Material.query.filter_by(is_active=True).all()

        # Calculate annual value for each material
        material_values = []

        for material in materials:
            monthly = material.get_monthly_consumption()
            annual_consumption = monthly * 12

            # Get unit price
            vendor_link = MaterialVendor.query.filter_by(
                material_id=material.id
            ).first()
            unit_price = vendor_link.unit_price if vendor_link and vendor_link.unit_price else 0

            annual_value = annual_consumption * unit_price

            material_values.append({
                'material_id': material.id,
                'code': material.code,
                'name': material.name,
                'category': material.category,
                'annual_consumption': round(annual_consumption, 2),
                'unit_price': unit_price,
                'annual_value': round(annual_value, 2)
            })

        # Sort by annual value descending
        material_values.sort(key=lambda x: x['annual_value'], reverse=True)

        # Calculate cumulative percentage
        total_value = sum(m['annual_value'] for m in material_values)

        if total_value == 0:
            return {
                'A': [],
                'B': [],
                'C': material_values,
                'summary': {
                    'total_annual_value': 0,
                    'a_count': 0,
                    'b_count': 0,
                    'c_count': len(material_values)
                }
            }

        cumulative = 0
        category_a = []
        category_b = []
        category_c = []

        for m in material_values:
            cumulative += m['annual_value']
            cumulative_pct = (cumulative / total_value) * 100
            m['cumulative_percentage'] = round(cumulative_pct, 1)

            if cumulative_pct <= 80:
                m['abc_class'] = 'A'
                category_a.append(m)
            elif cumulative_pct <= 95:
                m['abc_class'] = 'B'
                category_b.append(m)
            else:
                m['abc_class'] = 'C'
                category_c.append(m)

        return {
            'A': category_a,
            'B': category_b,
            'C': category_c,
            'summary': {
                'total_annual_value': round(total_value, 2),
                'a_count': len(category_a),
                'a_value': round(sum(m['annual_value'] for m in category_a), 2),
                'b_count': len(category_b),
                'b_value': round(sum(m['annual_value'] for m in category_b), 2),
                'c_count': len(category_c),
                'c_value': round(sum(m['annual_value'] for m in category_c), 2)
            }
        }

    def get_dead_stock(self, months: int = 6) -> list:
        """
        Find items not used in X months.
        Returns list of dead stock items with recommendations.
        """
        cutoff_date = datetime.utcnow() - timedelta(days=months * 30)

        # Get all active materials with stock
        materials = Material.query.filter(
            Material.is_active == True,
            Material.current_stock > 0
        ).all()

        dead_stock = []

        for material in materials:
            # Check for any consumption since cutoff
            last_consumption = StockHistory.query.filter(
                StockHistory.material_id == material.id,
                StockHistory.change_type == 'consume',
                StockHistory.created_at >= cutoff_date
            ).first()

            if not last_consumption:
                # Get last consumption date ever
                last_ever = StockHistory.query.filter(
                    StockHistory.material_id == material.id,
                    StockHistory.change_type == 'consume'
                ).order_by(StockHistory.created_at.desc()).first()

                # Get unit price
                vendor_link = MaterialVendor.query.filter_by(
                    material_id=material.id
                ).first()
                unit_price = vendor_link.unit_price if vendor_link and vendor_link.unit_price else 0

                stock_value = material.current_stock * unit_price

                dead_stock.append({
                    'material_id': material.id,
                    'code': material.code,
                    'name': material.name,
                    'category': material.category,
                    'current_stock': material.current_stock,
                    'unit': material.unit,
                    'stock_value': round(stock_value, 2),
                    'last_consumed': last_ever.created_at.isoformat() if last_ever else None,
                    'months_inactive': months if not last_ever else int((datetime.utcnow() - last_ever.created_at).days / 30),
                    'recommendation': 'Consider disposal or transfer to other location'
                })

        # Sort by stock value descending
        dead_stock.sort(key=lambda x: x['stock_value'], reverse=True)

        return dead_stock

    def generate_consumption_report(self, period: str = 'monthly') -> dict:
        """
        Generate comprehensive consumption report.
        Returns: {
            'period': 'February 2026',
            'total_consumed': 500,
            'total_value': 10000,
            'top_items': [...],
            'by_category': {...},
            'trends': {...}
        }
        """
        today = date.today()

        if period == 'monthly':
            period_start = today.replace(day=1)
            period_end = today
            period_name = today.strftime('%B %Y')
        elif period == 'weekly':
            period_start = today - timedelta(days=today.weekday())
            period_end = today
            period_name = f'Week of {period_start.isoformat()}'
        else:  # daily
            period_start = today
            period_end = today
            period_name = today.isoformat()

        # Get consumption data
        consumption_data = db.session.query(
            StockHistory.material_id,
            func.sum(func.abs(StockHistory.quantity_change)).label('total_consumed')
        ).filter(
            StockHistory.change_type == 'consume',
            func.date(StockHistory.created_at) >= period_start,
            func.date(StockHistory.created_at) <= period_end
        ).group_by(
            StockHistory.material_id
        ).all()

        total_consumed = 0
        total_value = 0
        by_category = {}
        top_items = []

        for cd in consumption_data:
            material = db.session.get(Material, cd.material_id)
            if not material:
                continue

            consumed = float(cd.total_consumed)
            total_consumed += consumed

            # Get unit price
            vendor_link = MaterialVendor.query.filter_by(
                material_id=material.id
            ).first()
            unit_price = vendor_link.unit_price if vendor_link and vendor_link.unit_price else 0
            value = consumed * unit_price
            total_value += value

            # By category
            category = material.category or 'other'
            if category not in by_category:
                by_category[category] = {'consumed': 0, 'value': 0}
            by_category[category]['consumed'] += consumed
            by_category[category]['value'] += value

            top_items.append({
                'material_id': material.id,
                'code': material.code,
                'name': material.name,
                'category': category,
                'consumed': round(consumed, 2),
                'unit': material.unit,
                'value': round(value, 2)
            })

        # Sort top items by value
        top_items.sort(key=lambda x: x['value'], reverse=True)

        # Round category values
        for cat in by_category:
            by_category[cat]['consumed'] = round(by_category[cat]['consumed'], 2)
            by_category[cat]['value'] = round(by_category[cat]['value'], 2)

        # Get previous period for trends
        if period == 'monthly':
            prev_start = (period_start - timedelta(days=1)).replace(day=1)
            prev_end = period_start - timedelta(days=1)
        elif period == 'weekly':
            prev_start = period_start - timedelta(days=7)
            prev_end = period_start - timedelta(days=1)
        else:
            prev_start = period_start - timedelta(days=1)
            prev_end = prev_start

        prev_value = db.session.query(
            func.sum(func.abs(StockHistory.quantity_change))
        ).filter(
            StockHistory.change_type == 'consume',
            func.date(StockHistory.created_at) >= prev_start,
            func.date(StockHistory.created_at) <= prev_end
        ).scalar() or 0

        if prev_value > 0:
            change_pct = ((total_value - prev_value) / prev_value) * 100
        else:
            change_pct = 0

        return {
            'period': period_name,
            'period_start': period_start.isoformat(),
            'period_end': period_end.isoformat(),
            'total_consumed': round(total_consumed, 2),
            'total_value': round(total_value, 2),
            'top_items': top_items[:10],
            'by_category': by_category,
            'trends': {
                'vs_previous_period': round(change_pct, 1),
                'direction': 'up' if change_pct > 0 else 'down' if change_pct < 0 else 'flat'
            },
            'generated_at': datetime.utcnow().isoformat()
        }
