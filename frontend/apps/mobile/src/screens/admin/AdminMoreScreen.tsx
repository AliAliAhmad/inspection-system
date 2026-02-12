import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { List, Divider } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

export default function AdminMoreScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();

  return (
    <ScrollView style={styles.container}>
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
        />

        <List.Item
          title="⏰ Overdue"
          description="Overdue items & SLA tracking"
          left={(props) => <List.Icon {...props} icon="clock-alert" />}
          onPress={() => navigation.navigate('Overdue')}
        />

        <List.Item
          title="📈 Performance"
          description="Team metrics & goals"
          left={(props) => <List.Icon {...props} icon="chart-line" />}
          onPress={() => navigation.navigate('MyPerformance')}
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
        />

        <List.Item
          title="📌 Assignments"
          description="Inspection assignments"
          left={(props) => <List.Icon {...props} icon="clipboard-list" />}
          onPress={() => navigation.navigate('InspectionAssignments')}
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
        />

        <List.Item
          title="🛠️ Engineer Jobs"
          description="All engineer jobs"
          left={(props) => <List.Icon {...props} icon="wrench" />}
          onPress={() => navigation.navigate('AllEngineerJobs')}
        />

        <List.Item
          title="🔍 All Inspections"
          description="View all inspections"
          left={(props) => <List.Icon {...props} icon="magnify" />}
          onPress={() => navigation.navigate('AllInspections')}
        />

        <List.Item
          title="⭐ Quality Reviews"
          description="Quality review admin"
          left={(props) => <List.Icon {...props} icon="star" />}
          onPress={() => navigation.navigate('QualityReviewsAdmin')}
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
