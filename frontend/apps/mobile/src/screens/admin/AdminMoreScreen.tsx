import React, { useRef } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { List, Divider } from 'react-native-paper';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { scale, vscale, mscale, fontScale } from '../../utils/scale';

export default function AdminMoreScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  return (
    <ScrollView ref={scrollRef} style={styles.container} testID="admin-more-screen">
      <List.Section>
        <List.Subheader>🆕 New Features</List.Subheader>

        <List.Item
          title="💬 Team Communication"
          description="Channels, messaging, team chat"
          left={(props) => <List.Icon {...props} icon="chat" />}
          onPress={() => navigation.navigate('ChannelList')}
        />

        <List.Item
          title="📝 Daily Review"
          description="Review daily work & AI suggestions"
          left={(props) => <List.Icon {...props} icon="clipboard-check" />}
          onPress={() => navigation.navigate('DailyReview')}
          testID="more-daily-review"
        />

        <List.Item
          title="⏰ Overdue"
          description="Overdue items & SLA tracking"
          left={(props) => <List.Icon {...props} icon="clock-alert" />}
          onPress={() => navigation.navigate('Overdue')}
          testID="more-overdue"
        />

        <List.Item
          title="📈 Performance"
          description="Team metrics & goals"
          left={(props) => <List.Icon {...props} icon="chart-line" />}
          onPress={() => navigation.navigate('MyPerformance')}
          testID="more-performance"
        />

        <List.Item
          title="🐛 Defects"
          description="Defect tracking & Kanban"
          left={(props) => <List.Icon {...props} icon="bug" />}
          onPress={() => navigation.navigate('Defects')}
        />

        <Divider />
        <List.Subheader>🔧 Management</List.Subheader>

        <List.Item
          title="⚙️ Equipment"
          description="Manage equipment"
          left={(props) => <List.Icon {...props} icon="cog" />}
          onPress={() => navigation.navigate('Equipment')}
          testID="more-equipment"
        />

        <List.Item
          title="✅ Checklists"
          description="Inspection checklists"
          left={(props) => <List.Icon {...props} icon="check-circle" />}
          onPress={() => navigation.navigate('Checklists')}
        />

        <List.Item
          title="📅 Schedules"
          description="Inspection schedules"
          left={(props) => <List.Icon {...props} icon="calendar" />}
          onPress={() => navigation.navigate('Schedules')}
          testID="more-schedules"
        />

        <List.Item
          title="📌 Assignments"
          description="Inspection assignments"
          left={(props) => <List.Icon {...props} icon="clipboard-list" />}
          onPress={() => navigation.navigate('InspectionAssignments')}
          testID="more-assignments"
        />

        <List.Item
          title="🔁 Routines"
          description="Inspection routines"
          left={(props) => <List.Icon {...props} icon="sync" />}
          onPress={() => navigation.navigate('InspectionRoutines')}
        />

        <List.Item
          title="👥 Team Roster"
          description="Manage team"
          left={(props) => <List.Icon {...props} icon="account-group" />}
          onPress={() => navigation.navigate('TeamRoster')}
        />

        <List.Item
          title="🏖️ Leave Approvals"
          description="Approve or reject leave requests"
          left={(props) => <List.Icon {...props} icon="calendar-check" />}
          onPress={() => navigation.navigate('LeaveApprovals')}
          testID="more-leave-approvals"
        />

        <List.Item
          title="🎁 Bonus Approvals"
          description="Approve or reject bonus requests"
          left={(props) => <List.Icon {...props} icon="gift" />}
          onPress={() => navigation.navigate('BonusApprovals')}
          testID="more-bonus-approvals"
        />

        <List.Item
          title="📊 Reports"
          description="Analytics & reports"
          left={(props) => <List.Icon {...props} icon="chart-bar" />}
          onPress={() => navigation.navigate('Reports')}
        />

        <Divider />
        <List.Subheader>👷 Work Management</List.Subheader>

        <List.Item
          title="🔧 Specialist Jobs"
          description="All specialist jobs"
          left={(props) => <List.Icon {...props} icon="tools" />}
          onPress={() => navigation.navigate('AllSpecialistJobs')}
          testID="more-specialist-jobs"
        />

        <List.Item
          title="🛠️ Engineer Jobs"
          description="All engineer jobs"
          left={(props) => <List.Icon {...props} icon="wrench" />}
          onPress={() => navigation.navigate('AllEngineerJobs')}
          testID="more-engineer-jobs"
        />

        <List.Item
          title="🔍 All Inspections"
          description="View all inspections"
          left={(props) => <List.Icon {...props} icon="magnify" />}
          onPress={() => navigation.navigate('AllInspections')}
          testID="more-all-inspections"
        />

        <List.Item
          title="⭐ Quality Reviews"
          description="Quality review admin"
          left={(props) => <List.Icon {...props} icon="star" />}
          onPress={() => navigation.navigate('QualityReviewsAdmin')}
          testID="more-quality-reviews"
        />

        <Divider />
        <List.Subheader>⚙️ Settings</List.Subheader>

        <List.Item
          title="🛠️ Toolkit Settings"
          description="Configure mobile toolkit"
          left={(props) => <List.Icon {...props} icon="tune" />}
          onPress={() => navigation.navigate('ToolkitSettings')}
        />
      </List.Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
});
