import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { errorMessage } from '@/api/client'
import type { SetupSummary } from '@/api/types'
import { Icon } from '@/components/Icon'
import { SetupCard } from '@/components/SetupCard'
import { UpdateSheet } from '@/components/UpdateSheet'
import { Button, ErrorState, Loading, Segmented } from '@/components/ui'
import { useAppUpdate, useCreateSetup, useSetups } from '@/hooks/queries'
import { gridColumns, useDeviceLayout } from '@/layout/device'
import { colors, radius, space } from '@/theme'

type Tab = 'mine' | 'templates'
/** The "New setup" card that ends the grid on tablets. */
const NEW_CARD = 'new' as const
type Item = SetupSummary | typeof NEW_CARD

export default function SetupsScreen() {
  const setups = useSetups()
  const create = useCreateSetup()
  const update = useAppUpdate()
  const [tab, setTab] = useState<Tab>('mine')
  const [query, setQuery] = useState('')
  const [updateOpen, setUpdateOpen] = useState(false)
  const [updateDismissed, setUpdateDismissed] = useState(false)
  const layout = useDeviceLayout()
  const columns = gridColumns(layout)
  const [listWidth, setListWidth] = useState(0)

  const list = useMemo(() => {
    const all = setups.data ?? []
    const q = query.trim().toLowerCase()
    return all.filter((s) => (tab === 'templates' ? s.is_template : !s.is_template)).filter((s) => !q || s.name.toLowerCase().includes(q))
  }, [setups.data, tab, query])

  const open = (id: number) => router.push({ pathname: '/setup/[id]', params: { id: String(id) } })
  const goLive = (id: number) => router.push({ pathname: '/live/check', params: { setupId: String(id) } })

  const make = (body: { name?: string; from_setup_id?: number }) =>
    create.mutate(body, {
      onSuccess: (created) => open(created.id),
      onError: (error) => Alert.alert('Couldn’t make the setup', errorMessage(error)),
    })

  const more = (setup: SetupSummary) =>
    Alert.alert(setup.name, undefined, [
      { text: 'Duplicate', onPress: () => make({ from_setup_id: setup.id }) },
      { text: 'Cancel', style: 'cancel' },
    ])

  const pad = layout.tablet ? 40 : space.xl
  const gap = layout.tablet ? space.lg : space.md
  const cellWidth = columns > 1 && listWidth > 0 ? Math.floor((listWidth - pad * 2 - gap * (columns - 1)) / columns) : undefined
  const items: Item[] = layout.tablet && tab === 'mine' && !query.trim() && list.length > 0 ? [...list, NEW_CARD] : list

  const search = (
    <View style={layout.tablet ? { width: 320 } : undefined}>
      <View style={{ position: 'absolute', left: 14, top: 14 }} pointerEvents="none">
        <Icon name="search" size={20} color={colors.muted} />
      </View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search setups"
        placeholderTextColor={colors.muted}
        accessibilityLabel="Search setups"
        style={styles.search}
        returnKeyType="search"
      />
    </View>
  )

  if (setups.isPending) return <Loading />
  if (setups.isError && !setups.data) return <ErrorState message={errorMessage(setups.error)} onRetry={() => void setups.refetch()} />

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }} onLayout={(e) => setListWidth(e.nativeEvent.layout.width)}>
      <FlatList<Item>
        // A different column count is a different list (FlatList can't change it in place).
        key={`cols-${columns}`}
        data={items}
        numColumns={columns}
        keyExtractor={(s) => (s === NEW_CARD ? NEW_CARD : String(s.id))}
        columnWrapperStyle={columns > 1 ? { gap } : undefined}
        contentContainerStyle={{ padding: pad, paddingTop: layout.tablet ? 32 : pad, gap, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={setups.isRefetching} onRefresh={() => void setups.refetch()} tintColor={colors.link} colors={[colors.link]} progressBackgroundColor={colors.surface} />}
        ListHeaderComponent={
          <View style={{ gap: space.lg, marginBottom: space.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.lg }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, layout.tablet && { fontSize: 32 }]} accessibilityRole="header">
                  My setups
                </Text>
                <Text style={{ color: colors.muted, fontSize: 15 }}>Open a setup, then go live.</Text>
              </View>
              {layout.tablet && search}
              <Button
                label={layout.tablet ? 'New setup' : 'New'}
                icon="plus"
                size="md"
                onPress={() => make({})}
                busy={create.isPending}
                style={{ borderRadius: radius.pill }}
                accessibilityLabel="New setup"
              />
            </View>

            {update.available && !updateDismissed && (
              <Pressable onPress={() => setUpdateOpen(true)} accessibilityRole="button" style={styles.updateBanner}>
                <Icon name="download" size={20} color={colors.link} />
                <Text style={{ flex: 1, color: colors.text, fontSize: 15 }}>A new version of the app is ready.</Text>
                <Pressable onPress={() => setUpdateDismissed(true)} accessibilityRole="button" accessibilityLabel="Hide this" hitSlop={10}>
                  <Icon name="close" size={18} color={colors.muted} />
                </Pressable>
              </Pressable>
            )}

            <View style={layout.tablet ? { width: 320 } : undefined}>
              <Segmented
                label="Show"
                value={tab}
                onChange={setTab}
                options={[
                  { id: 'mine', label: 'My setups' },
                  { id: 'templates', label: 'Templates' },
                ]}
              />
            </View>
            {!layout.tablet && search}
          </View>
        }
        renderItem={({ item }) => (
          <View style={cellWidth ? { width: cellWidth } : undefined}>
            {item === NEW_CARD ? (
              <Pressable onPress={() => make({})} disabled={create.isPending} accessibilityRole="button" accessibilityLabel="New setup" style={styles.newCard}>
                <Icon name="plus" size={28} color={colors.link} />
                <Text style={{ color: colors.link, fontSize: 16, fontWeight: '700' }}>New setup</Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>Start blank, or copy one from Templates</Text>
              </Pressable>
            ) : item.is_template ? (
              <SetupCard setup={item} large={layout.tablet} onUseTemplate={() => make({ from_setup_id: item.id })} />
            ) : (
              <SetupCard setup={item} large={layout.tablet} onGoLive={() => goLive(item.id)} onEdit={() => open(item.id)} onMore={() => more(item)} />
            )}
          </View>
        )}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', gap: space.md, paddingTop: 40 }}>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{query.trim() ? 'No setups match' : tab === 'mine' ? 'No setups yet' : 'No templates'}</Text>
            <Text style={{ color: colors.muted, fontSize: 15, textAlign: 'center' }}>
              {query.trim() ? `Nothing is called “${query.trim()}”.` : 'Start from a template, or make a new setup.'}
            </Text>
            {tab === 'mine' && !query.trim() && <Button label="See templates" variant="secondary" size="md" onPress={() => setTab('templates')} />}
          </View>
        }
      />
      <UpdateSheet visible={updateOpen} onClose={() => setUpdateOpen(false)} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  search: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
    paddingLeft: 44,
    paddingRight: space.lg,
  },
  newCard: {
    minHeight: 198,
    borderRadius: radius.xl,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    padding: space.lg,
  },
  updateBanner: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52, paddingHorizontal: 14, borderRadius: radius.lg, backgroundColor: colors.tint },
})
