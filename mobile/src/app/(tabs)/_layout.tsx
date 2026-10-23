import { Tabs } from 'expo-router'

import { Icon } from '@/components/Icon'
import { useDeviceLayout } from '@/layout/device'
import { colors } from '@/theme'

export default function TabsLayout() {
  // Tablets: a navigation rail on the left, so the screen's width goes to content.
  const { tablet } = useDeviceLayout()
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.link,
        tabBarInactiveTintColor: colors.muted,
        tabBarPosition: tablet ? 'left' : 'bottom',
        tabBarVariant: tablet ? 'material' : 'uikit',
        tabBarStyle: tablet
          ? { backgroundColor: colors.surface, borderRightColor: colors.line, width: 96, paddingTop: 24 }
          : { backgroundColor: colors.surface, borderTopColor: colors.line, height: 68, paddingTop: 6 },
        tabBarActiveBackgroundColor: tablet ? colors.tint : undefined,
        tabBarItemStyle: tablet ? { borderRadius: 16, marginHorizontal: 8, marginVertical: 4, minHeight: 72 } : undefined,
        tabBarLabelStyle: { fontSize: tablet ? 13 : 12, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Setups', tabBarIcon: ({ color }) => <Icon name="grid" color={color} /> }} />
      <Tabs.Screen name="platforms" options={{ title: 'Platforms', tabBarIcon: ({ color }) => <Icon name="broadcast" color={color} /> }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: ({ color }) => <Icon name="user" color={color} /> }} />
    </Tabs>
  )
}
