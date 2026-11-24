import { Router } from 'express';
import { one } from '../db';
import { reqUser, requireAuth } from '../auth';
import { ensureSupportTicket } from '../support';
import { asyncHandler } from '../utils';

const router = Router();

/**
 * The user's official support entry: profile of the support account, the private
 * conversation id and the ticket status. Created on first access.
 */
router.get(
  '/',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const { ticketId, conversationId, supportId, status } = await ensureSupportTicket(me);
    const support = await one<{
      id: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
    }>('SELECT id, username, display_name, avatar_url FROM users WHERE id = $1', [supportId]);
    res.json({
      ticketId,
      conversationId,
      status,
      support: support
        ? {
            id: support.id,
            username: support.username,
            displayName: support.display_name,
            avatarUrl: support.avatar_url,
            isSupport: true,
          }
        : null,
    });
  })
);

export default router;
