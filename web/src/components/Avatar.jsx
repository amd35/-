export default function Avatar({ user, size = 42, showLevel = true }) {
  if (!user) return null
  const initials = (user.display_name || user.username || '?').slice(0, 2)
  return (
    <span className="avatar" style={{ width: size, height: size }}>
      {user.avatar_url ? <img src={user.avatar_url} alt={user.display_name || user.username} /> : initials}
      {showLevel && user.level ? <span className="avatar-level">{user.level}</span> : null}
    </span>
  )
}
