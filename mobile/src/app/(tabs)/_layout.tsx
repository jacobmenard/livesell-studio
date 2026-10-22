import { Tabs } from 'expo-router'

import { Icon } from '@/components/Icon'
import { colors } from '@/theme'

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.link,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line, height: 68, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Setups', tabBarIcon: ({ color }) => <Icon name="grid" color={color} /> }} />
      <Tabs.Screen name="platforms" options={{ title: 'Platforms', tabBarIcon: ({ color }) => <Icon name="broadcast" color={color} /> }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: ({ color }) => <Icon name="user" color={color} /> }} />
    </Tabs>
  )
}
