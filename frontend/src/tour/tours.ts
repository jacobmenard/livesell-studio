import type { User } from '../lib/types'

/**
 * One stop on a walkthrough. `target` matches an element's data-tour attribute; without one
 * (or when that element isn't on screen) the card shows in the middle of the page.
 */
export interface TourStep {
  target?: string
  title: string
  body: string
}

/** My setups, the first time a seller signs in. */
export function dashboardTour(user: User): TourStep[] {
  const firstName = user.name.trim().split(/\s+/)[0] || 'there'
  const owner = !user.is_subuser
  return [
    {
      title: `Welcome to NegosyoWork Studio, ${firstName}!`,
      body: owner
        ? 'Here’s a 30-second look at how to get your live selling ready. You can skip anytime.'
        : `You’re in ${user.account_name}’s account. Here’s a 30-second look at how setups work. You can skip anytime.`,
    },
    {
      target: 'new-setup',
      title: 'Make your first setup',
      body: 'A setup saves everything for one kind of live: your camera, background, foreground, popups and sounds. Tap New setup to build one.',
    },
    {
      target: 'setup-filters',
      title: 'Or start from a template',
      body: 'Not sure where to begin? Open Templates and pick a ready-made look. It’s copied into your setups so you can change anything.',
    },
    {
      target: 'setup-list',
      title: 'Your saved setups',
      body: 'Before every live, open a setup from here. Use Duplicate to make a variation, like a sale-day version.',
    },
    ...(owner
      ? [
          {
            target: 'nav-plan',
            title: 'Ready to go live?',
            body: 'The Free plan lets you set up and preview everything. When you’re ready to sell live, choose a plan here and pay with GCash.',
          },
          {
            target: 'nav-team',
            title: 'Bring your team',
            body: 'On the Duo and Team plans, add helpers who sign in with their own email and work in your setups.',
          },
        ]
      : []),
    {
      target: 'tour-replay',
      title: 'Need a refresher?',
      body: 'Tap Show me around anytime to see this again. When you open a setup, a short tour shows you the editor too.',
    },
  ]
}

/** The setup editor, the first time a seller opens one. */
export const EDITOR_TOUR: TourStep[] = [
  {
    title: 'This is your live setup',
    body: 'Everything you change here shows in the preview right away. Here’s how the screen is laid out.',
  },
  {
    target: 'editor-preview',
    title: 'The preview',
    body: 'This is exactly what your viewers will see. Start your camera here, and drag popups on the preview to move or resize them.',
  },
  {
    target: 'editor-steps',
    title: 'Five steps, in order',
    body: '1 Camera · 2 Foreground · 3 Background · 4 Popups · 5 Go live. Work through them left to right; you can come back to any step.',
  },
  {
    target: 'editor-sounds',
    title: 'Sound pads',
    body: 'Tap a pad, or press its key (1–0, Q, W, E), to play applause, a drumroll and more. Turn on “Send to live” so your viewers hear them too.',
  },
  {
    target: 'editor-save',
    title: 'Save your setup',
    body: 'Changes are kept only when you save. “Not saved yet” means there’s something new to save. Ctrl+S works too.',
  },
  {
    target: 'editor-golive',
    title: 'Go live',
    body: 'When it looks right, open step 5. Use the clean screen in TikTok LIVE Studio or OBS, or stream straight to Facebook or YouTube. Going live needs a paid plan.',
  },
]
