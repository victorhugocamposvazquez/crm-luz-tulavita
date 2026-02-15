/**
 * Hook para conversaciones y mensajes de un lead (CRM).
 * Carga eventos, conversaciones, mensajes y expone timeline unificado + acciones outbound.
 */

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ConversationChannel } from '@/types/crm';
import type { Database } from '@/integrations/supabase/types';

type LeadConversationRow = Database['public']['Tables']['lead_conversations']['Row'];
type LeadMessageRow = Database['public']['Tables']['lead_messages']['Row'];

export interface LeadEventRow {
  id: string;
  lead_id: string;
  type: string;
  content: Record<string, unknown> | null;
  created_at: string;
}

export type TimelineItem =
  | { type: 'event'; id: string; created_at: string; data: LeadEventRow }
  | {
      type: 'message';
      id: string;
      created_at: string;
      data: LeadMessageRow;
      channel: string;
    };

export function useConversation(leadId: string | null) {
  const [events, setEvents] = useState<LeadEventRow[]>([]);
  const [conversations, setConversations] = useState<LeadConversationRow[]>([]);
  const [messages, setMessages] = useState<LeadMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!leadId) {
      setEvents([]);
      setConversations([]);
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [eventsRes, convRes] = await Promise.all([
        supabase
          .from('lead_events')
          .select('id, lead_id, type, content, created_at')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: false }),
        supabase
          .from('lead_conversations')
          .select('*')
          .eq('lead_id', leadId)
          .order('updated_at', { ascending: false }),
      ]);

      if (eventsRes.error) throw eventsRes.error;
      if (convRes.error) throw convRes.error;

      setEvents((eventsRes.data as LeadEventRow[]) ?? []);
      const convList = (convRes.data ?? []) as LeadConversationRow[];
      setConversations(convList);

      if (convList.length === 0) {
        setMessages([]);
      } else {
        const convIds = convList.map((c) => c.id);
        const { data: msgData, error: msgErr } = await supabase
          .from('lead_messages')
          .select('*')
          .in('conversation_id', convIds)
          .order('created_at', { ascending: false });
        if (msgErr) throw msgErr;
        setMessages((msgData as LeadMessageRow[]) ?? []);
      }
    } catch (e) {
      console.error('useConversation fetch:', e);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const getConversationByChannel = useCallback(
    (channel: ConversationChannel): LeadConversationRow | undefined =>
      conversations.find((c) => c.channel === channel),
    [conversations]
  );

  const getOrCreateConversation = useCallback(
    async (channel: ConversationChannel): Promise<string | null> => {
      if (!leadId) return null;
      const existing = getConversationByChannel(channel);
      if (existing) return existing.id;
      const { data, error } = await supabase
        .from('lead_conversations')
        .insert({ lead_id: leadId, channel, status: 'open' })
        .select('id')
        .single();
      if (error) {
        console.error('create conversation:', error);
        return null;
      }
      await fetchAll();
      return (data as { id: string }).id;
    },
    [leadId, getConversationByChannel, fetchAll]
  );

  const sendOutboundMessage = useCallback(
    async (conversationId: string, content: string): Promise<boolean> => {
      setSending(true);
      try {
        const { data: user } = await supabase.auth.getUser();
        const { error } = await supabase.from('lead_messages').insert({
          conversation_id: conversationId,
          direction: 'outbound',
          content: content || null,
          status: 'sent',
          user_id: user.data?.user?.id ?? null,
        });
        if (error) throw error;
        await fetchAll();
        return true;
      } catch (e) {
        console.error('sendOutboundMessage:', e);
        return false;
      } finally {
        setSending(false);
      }
    },
    [fetchAll]
  );

  const timeline: TimelineItem[] = (() => {
    const items: TimelineItem[] = events.map((e) => ({
      type: 'event' as const,
      id: e.id,
      created_at: e.created_at,
      data: e,
    }));
    const convMap = new Map(conversations.map((c) => [c.id, c]));
    for (const m of messages) {
      const conv = convMap.get(m.conversation_id);
      items.push({
        type: 'message',
        id: m.id,
        created_at: m.created_at,
        data: m,
        channel: conv?.channel ?? 'unknown',
      });
    }
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return items;
  })();

  return {
    events,
    conversations,
    messages,
    timeline,
    loading,
    sending,
    refetch: fetchAll,
    getConversationByChannel,
    getOrCreateConversation,
    sendOutboundMessage,
  };
}
