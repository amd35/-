import PhotoIcon from './PhotoIcon.jsx'

/**
 * الغلاف المشترك للوحات الملف الشخصي: طبقة معتمة + لوحة بخامات داكنة وحدود ذهبية.
 * تصميم فقط — كل محتوى اللوحة يأتي من الصفحة المستدعية.
 */
export default function ProfileSheet({ title, icon = '', onClose, children, testId = 'profile-sheet' }) {
  return (
    <div className="overlay" onClick={onClose} data-testid={testId}>
      <div className="sheet profile-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="row-between">
          <h3 className="section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            {icon ? <PhotoIcon name={icon} size={20} /> : null}
            {title}
          </h3>
          <button type="button" className="btn" onClick={onClose} data-testid={`${testId}-close`}>
            إغلاق
          </button>
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  )
}
