import { useEffect, useState } from 'react';
import { notificationService } from '../services/notificationService';

export const NOTIFICATIONS_CHANGED_EVENT = 'talentiq:notifications-changed';

const messageFromError = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
};

export const useNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    Promise.all([
      notificationService.listNotifications(),
      notificationService.getUnreadCount(),
    ]).then(([items, count]) => {
      if (cancelled) return;
      setNotifications(items);
      setUnreadCount(count);
    }).catch((loadError) => {
      if (!cancelled) setError(messageFromError(loadError, 'Notifications could not be loaded.'));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [reloadCount]);

  useEffect(() => {
    const reloadOnNotificationChange = () => setReloadCount((count) => count + 1);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, reloadOnNotificationChange);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, reloadOnNotificationChange);
  }, []);

  const refresh = () => setReloadCount((count) => count + 1);

  const markRead = async (notificationId) => {
    setActionError('');
    try {
      await notificationService.markRead(notificationId);
      setNotifications((items) => items.map((item) => item.id === notificationId ? { ...item, is_read: true } : item));
      setUnreadCount((count) => Math.max((count ?? 0) - 1, 0));
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
    } catch (requestError) {
      setActionError(messageFromError(requestError, 'The notification could not be marked as read.'));
      throw requestError;
    }
  };

  const markAllRead = async () => {
    setActionError('');
    try {
      await notificationService.markAllRead();
      setNotifications((items) => items.map((item) => ({ ...item, is_read: true })));
      setUnreadCount(0);
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
    } catch (requestError) {
      setActionError(messageFromError(requestError, 'Notifications could not be marked as read.'));
      throw requestError;
    }
  };

  return { notifications, unreadCount, loading, error, actionError, refresh, markRead, markAllRead };
};