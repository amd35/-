import { useState } from 'react'
import PageHeader from '../components/PageHeader.jsx'
import { DEFAULT_SETTINGS, useSettings } from '../store/settings.jsx'

const PAGE_OPTIONS = [
  { value: '/dashboard', label: 'Dashboard' },
  { value: '/data-management', label: 'Data Management' },
]

const ROW_OPTIONS = [5, 10, 25, 50]

export default function Settings() {
  const { settings, saveSettings, resetSettings } = useSettings()
  const [draft, setDraft] = useState(settings)
  const [saved, setSaved] = useState(false)

  const setField = (field) => (event) => {
    const target = event.target
    setSaved(false)
    setDraft((previous) => ({
      ...previous,
      [field]: target.type === 'checkbox' ? target.checked : target.value,
    }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    saveSettings({ ...draft, rowsPerPage: Number(draft.rowsPerPage) })
    setSaved(true)
  }

  const handleReset = () => {
    resetSettings()
    setDraft({ ...DEFAULT_SETTINGS })
    setSaved(false)
  }

  return (
    <div className="page">
      <PageHeader title="Settings" subtitle="Manage your profile, preferences and workspace defaults." />

      <form className="form" onSubmit={handleSubmit}>
        <section className="card card-padded">
          <h2 className="section-title">Profile</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="displayName">Display name</label>
              <input
                id="displayName"
                data-testid="settings-display-name"
                type="text"
                value={draft.displayName}
                onChange={setField('displayName')}
                placeholder="How should we greet you?"
              />
            </div>
            <div className="field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                data-testid="settings-email"
                type="email"
                value={draft.email}
                onChange={setField('email')}
                placeholder="you@example.com"
              />
            </div>
          </div>
        </section>

        <section className="card card-padded">
          <h2 className="section-title">Preferences</h2>
          <div className="form-grid">
            <fieldset className="field">
              <legend>Theme</legend>
              <div className="radio-row">
                {['light', 'dark'].map((theme) => (
                  <label className="radio" key={theme}>
                    <input
                      type="radio"
                      name="theme"
                      value={theme}
                      data-testid={`settings-theme-${theme}`}
                      checked={draft.theme === theme}
                      onChange={setField('theme')}
                    />
                    <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="field">
              <label htmlFor="defaultPage">Start page</label>
              <select
                id="defaultPage"
                data-testid="settings-default-page"
                value={draft.defaultPage}
                onChange={setField('defaultPage')}
              >
                {PAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="rowsPerPage">Rows per page</label>
              <select
                id="rowsPerPage"
                data-testid="settings-rows"
                value={String(draft.rowsPerPage)}
                onChange={setField('rowsPerPage')}
              >
                {ROW_OPTIONS.map((option) => (
                  <option key={option} value={String(option)}>
                    {option} rows
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Notifications</label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  data-testid="settings-email-updates"
                  checked={Boolean(draft.emailUpdates)}
                  onChange={setField('emailUpdates')}
                />
                <span>Email me when a record changes</span>
              </label>
            </div>
          </div>
        </section>

        <div className="form-actions">
          <button type="submit" className="button button-primary" data-testid="save-settings">
            Save settings
          </button>
          <button type="button" className="button button-secondary" onClick={handleReset}>
            Reset to defaults
          </button>
          <span className="save-status" role="status" data-testid="settings-status">
            {saved ? 'Settings saved.' : ''}
          </span>
        </div>
      </form>
    </div>
  )
}
