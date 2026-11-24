/** Lists the people behind a profile counter (followers, following, friends). */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { Avatar, EmptyState, Sheet, Spinner } from '../../lib/ui';
import type { UserCardData } from '../UserCard';
import type { ConnectionKind } from './ProfileHero';

const TITLE_KEYS: Record<ConnectionKind, string> = {
  followers: 'followers',
  following: 'followingCount',
  friends: 'friendsCount',
};

export function ConnectionsSheet({
  kind,
  userId,
  onClose,
}: {
  kind: ConnectionKind | null;
  userId: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserCardData[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!kind) return;
    let alive = true;
    setLoading(true);
    setUsers([]);
    const path = kind === 'friends' ? '/users?filter=friends&limit=100' : `/users/${userId}/${kind}`;
    api<{ users: UserCardData[] }>(path)
      .then((response) => {
        if (alive) setUsers(response.users);
      })
      .catch(() => {
        if (alive) setUsers([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [kind, userId]);

  return (
    <Sheet open={Boolean(kind)} onClose={onClose} title={kind ? t(TITLE_KEYS[kind]) : ''}>
      {loading ? (
        <Spinner label={t('loading')} />
      ) : users.length === 0 ? (
        <EmptyState icon="users" title={t('noResults')} />
      ) : (
        <div className="list">
          {users.map((user) => (
            <div
              key={user.id}
              className="row"
              onClick={() => {
                onClose();
                navigate(`/u/${user.id}`);
              }}
            >
              <Avatar user={user} />
              <div className="row-main">
                <div className="row-title">{user.displayName}</div>
                <div className="row-sub">#{user.username}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
