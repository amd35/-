import { useCallback, useEffect, useState } from 'react';
import { api, assetUrl } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { Avatar, formatTimeAgo, Icon, Spinner, useToast } from '../../lib/ui';

export interface AnnouncementCategory {
  key: string;
  labelAr: string;
  labelEn: string;
  color: string;
  icon: string;
}

export interface AnnouncementData {
  id: string;
  title: string;
  body: string;
  category: string;
  mediaType: 'none' | 'image' | 'video' | string;
  mediaUrl: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  isPinned: boolean;
  commentsEnabled: boolean;
  publishedAt: string | null;
  createdAt: string;
  createdByName: string;
  myReaction: string | null;
  reactions: Record<string, number>;
  reactionCount: number;
  commentCount: number;
  views: number;
  recipientCount: number;
  readCount: number;
  read: boolean;
  viewed: boolean;
}

interface CommentRow {
  id: string;
  body: string;
  createdAt: string;
  mine: boolean;
  user: { id: string; displayName: string; username: string; avatarUrl: string | null };
}

export function CategoryPill({
  category,
  categories,
}: {
  category: string;
  categories: AnnouncementCategory[];
}) {
  const { lang } = useI18n();
  const meta = categories.find((item) => item.key === category) ?? categories[0];
  if (!meta) return null;
  return (
    <span className="announcement-cat" style={{ borderColor: meta.color, color: meta.color }}>
      <Icon name={meta.icon} size={12} />
      {lang === 'ar' ? meta.labelAr : meta.labelEn}
    </span>
  );
}

export function AnnouncementMedia({ announcement }: { announcement: AnnouncementData }) {
  const url = assetUrl(announcement.mediaUrl);
  if (!url) return null;
  if (announcement.mediaType === 'video') {
    return (
      <video className="announcement-media" src={url} controls playsInline preload="metadata" />
    );
  }
  return <img className="announcement-media" src={url} alt={announcement.title} loading="lazy" />;
}

export function AnnouncementCard({
  announcement,
  categories,
  emojis,
  onView,
  onReact,
  onReply,
  onChanged,
}: {
  announcement: AnnouncementData;
  categories: AnnouncementCategory[];
  emojis: string[];
  onView: (id: string) => Promise<void> | void;
  onReact: (id: string, emoji: string) => Promise<void> | void;
  onReply: (announcement: AnnouncementData) => void;
  onChanged?: () => void;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [comments, setComments] = useState<CommentRow[] | null>(null);
  const [loadingComments, setLoadingComments] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const loadComments = useCallback(async () => {
    setLoadingComments(true);
    try {
      const response = await api<{ comments: CommentRow[] }>(
        `/announcements/${announcement.id}/comments`
      );
      setComments(response.comments);
    } catch {
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  }, [announcement.id]);

  const open = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) {
      void onView(announcement.id);
      if (announcement.commentsEnabled) void loadComments();
    }
  };

  useEffect(() => {
    if (expanded && announcement.commentsEnabled && comments === null) void loadComments();
  }, [expanded, announcement.commentsEnabled, comments, loadComments]);

  const sendComment = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      await api(`/announcements/${announcement.id}/comments`, {
        method: 'POST',
        body: { body },
      });
      setDraft('');
      await loadComments();
      onChanged?.();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setSending(false);
    }
  };

  const totalReactions = Object.values(announcement.reactions ?? {}).reduce(
    (sum, value) => sum + value,
    0
  );

  return (
    <article className={`announcement-card ${announcement.read ? '' : 'is-unread'}`}>
      <div className="announcement-head">
        <div className="announcement-badges">
          <CategoryPill category={announcement.category} categories={categories} />
          {announcement.isPinned ? (
            <span className="pill pill-gold" style={{ padding: '2px 8px', fontSize: 10 }}>
              <Icon name="pin" size={11} /> {t('pinnedLabel')}
            </span>
          ) : null}
          {!announcement.read ? <span className="online-dot" style={{ position: 'static' }} /> : null}
        </div>
        <span className="tiny muted">
          {formatTimeAgo(announcement.publishedAt || announcement.createdAt, lang)}
        </span>
      </div>

      <h3 className="announcement-title">{announcement.title}</h3>
      <p className={`announcement-body ${expanded ? 'is-open' : ''}`}>{announcement.body}</p>
      <AnnouncementMedia announcement={announcement} />
      {announcement.linkUrl ? (
        <a
          className="btn btn-outline btn-sm announcement-link"
          href={announcement.linkUrl}
          target="_blank"
          rel="noreferrer"
        >
          <Icon name="globe" size={14} /> {announcement.linkLabel || announcement.linkUrl}
        </a>
      ) : null}

      <div className="announcement-meta">
        <span>
          <Icon name="eye" size={13} /> {announcement.views} {t('viewsLabel')}
        </span>
        <span>
          <Icon name="heart" size={13} /> {totalReactions} {t('reactionsLabel')}
        </span>
        <span>
          <Icon name="chat" size={13} /> {announcement.commentCount} {t('commentsLabel')}
        </span>
        <button className="btn btn-ghost btn-xs" onClick={open}>
          {expanded ? t('showLess') : t('readMore')}
        </button>
      </div>

      <div className="reaction-bar">
        <button
          className={`reaction-chip ${announcement.myReaction ? 'is-active' : ''}`}
          onClick={() => void onReact(announcement.id, announcement.myReaction ?? '👍')}
          aria-label="like"
        >
          👍 <span>{announcement.reactions['👍'] ?? 0}</span>
        </button>
        <button
          className="reaction-chip"
          onClick={() => setPickerOpen((value) => !value)}
          aria-label="reactions"
        >
          😊 <Icon name="plus" size={11} />
        </button>
        {Object.entries(announcement.reactions ?? {})
          .filter(([emoji, count]) => count > 0 && emoji !== '👍')
          .slice(0, 5)
          .map(([emoji, count]) => (
            <button
              key={emoji}
              className={`reaction-chip ${announcement.myReaction === emoji ? 'is-active' : ''}`}
              onClick={() => void onReact(announcement.id, emoji)}
            >
              {emoji} <span>{count}</span>
            </button>
          ))}
        <button className="btn btn-ghost btn-xs" style={{ marginInlineStart: 'auto' }} onClick={() => onReply(announcement)}>
          <Icon name="chat" size={13} /> {t('replyToAnnouncement')}
        </button>
      </div>

      {pickerOpen ? (
        <div className="emoji-picker">
          {emojis.map((emoji) => (
            <button
              key={emoji}
              className={`emoji-option ${announcement.myReaction === emoji ? 'is-active' : ''}`}
              onClick={() => {
                void onReact(announcement.id, emoji);
                setPickerOpen(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}

      {expanded ? (
        <section className="announcement-comments">
          {!announcement.commentsEnabled ? (
            <p className="tiny muted">{t('commentsOff')}</p>
          ) : loadingComments && comments === null ? (
            <Spinner />
          ) : (
            <>
              <div className="comment-list">
                {(comments ?? []).map((comment) => (
                  <div key={comment.id} className="comment-item">
                    <Avatar user={comment.user} size={30} />
                    <div>
                      <div className="comment-head">
                        <b>{comment.user.displayName}</b>
                        <span className="tiny muted">{formatTimeAgo(comment.createdAt, lang)}</span>
                      </div>
                      <p className="comment-body">{comment.body}</p>
                    </div>
                  </div>
                ))}
                {comments && comments.length === 0 ? (
                  <p className="tiny muted">{t('writeComment')}</p>
                ) : null}
              </div>
              <div className="comment-compose">
                <input
                  className="input"
                  value={draft}
                  maxLength={500}
                  placeholder={t('writeComment')}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void sendComment();
                  }}
                />
                <button
                  className="btn btn-primary btn-sm"
                  disabled={sending || !draft.trim()}
                  onClick={() => void sendComment()}
                >
                  <Icon name="send" size={14} />
                </button>
              </div>
            </>
          )}
        </section>
      ) : null}

      <div className="tiny muted announcement-signature">
        <Icon name="shield" size={11} /> {announcement.createdByName || 'YALLA PHONE'}
      </div>
    </article>
  );
}
