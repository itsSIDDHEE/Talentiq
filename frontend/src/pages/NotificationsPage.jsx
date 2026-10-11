import React, { useState } from 'react';
import { Bell, Check, CheckCheck, RefreshCw } from 'lucide-react';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import PageHeader from '../components/layout/PageHeader';
import { useNotifications } from '../hooks/useNotifications';

const formatDate = (value) => {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

export const NotificationsPage = ({ title = 'Notifications' }) => {
  const { notifications, unreadCount, loading, error, actionError, refresh, markRead, markAllRead } = useNotifications();
  const [readingId, setReadingId] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);

  const handleMarkRead = async (notificationId) => {
    setReadingId(notificationId);
    try { await markRead(notificationId); } catch { /* The hook exposes the request error. */ }
    setReadingId(null);
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try { await markAllRead(); } catch { /* The hook exposes the request error. */ }
    setMarkingAll(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle="Updates and alerts for your account."
        actions={unreadCount > 0 && (
          <Button variant="outline" size="sm" icon={CheckCheck} loading={markingAll} onClick={handleMarkAllRead}>
            Mark all as read
          </Button>
        )}
      />

      {actionError && <p role="alert" className="text-sm text-rose-700">{actionError}</p>}

      {loading ? (
        <div className="rounded-lg border border-[#DCE5DF] bg-white p-5" aria-live="polite" aria-busy="true">
          <div className="space-y-3">
            <div className="h-4 w-2/3 animate-pulse rounded bg-[#E8EFEA]" />
            <div className="h-3 w-full animate-pulse rounded bg-[#F1F5F2]" />
            <p className="text-xs text-[#687A73]">Loading notifications...</p>
          </div>
        </div>
      ) : error ? (
        <Card>
          <div role="alert" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-rose-700">{error}</p>
            <Button variant="outline" size="sm" icon={RefreshCw} onClick={refresh}>Retry</Button>
          </div>
        </Card>
      ) : notifications.length === 0 ? (
        <Card className="py-10 text-center">
          <Bell className="mx-auto h-8 w-8 text-[#9BB0A6]" />
          <p className="mt-3 text-sm font-semibold text-[#10221E]">No notifications</p>
          <p className="mt-1 text-xs text-[#687A73]">New account updates will appear here.</p>
        </Card>
      ) : (
        <Card title="All notifications" subtitle={`${unreadCount ?? 0} unread`}>
          <ul className="divide-y divide-[#E8EFEA]">
            {notifications.map((notification) => (
              <li key={notification.id} className={`flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-start sm:justify-between ${notification.is_read ? '' : '-mx-2 rounded-md bg-[#DFF2EA]/25 px-2'}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-[#10221E]">{notification.title}</h2>
                    {!notification.is_read && <Badge variant="primary" size="sm" dot>Unread</Badge>}
                  </div>
                  <p className="mt-1 text-sm leading-5 text-[#42544E]">{notification.message}</p>
                  <p className="mt-2 text-xs text-[#687A73]">
                    {notification.type} · {formatDate(notification.created_at)}
                  </p>
                </div>
                {notification.is_read ? (
                  <span className="shrink-0 text-xs text-[#687A73]">Read</span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    icon={Check}
                    loading={readingId === notification.id}
                    disabled={readingId !== null || markingAll}
                    onClick={() => handleMarkRead(notification.id)}
                  >
                    Mark as read
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
};

export default NotificationsPage;