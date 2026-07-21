'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Message } from '@/app/lib/types';

interface Props {
  sessionId: string;
  initialMessages: Message[];
  viewerRole: 'user' | 'worker';
}

export default function SessionChat({ sessionId, initialMessages, viewerRole }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Poll for new messages every 5s
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (res.ok) {
          const json = await res.json();
          setMessages(json.data.messages);
        }
      } catch {}
    }, 5000);
    return () => clearInterval(t);
  }, [sessionId]);

  async function send() {
    if (!content.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: content.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message || 'Could not send.');
        setSending(false);
        return;
      }
      setMessages((m) => [...m, json.data.message]);
      setContent('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border border-ink-200 rounded-lg bg-white flex flex-col h-[500px]">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-ink-400 italic">No messages yet. Say hi!</p>
        )}
        {messages.map((m) => {
          const isMine = m.fromRole === viewerRole;
          return (
            <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                  isMine ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-900'
                }`}
              >
                <div className="text-xs opacity-70 mb-0.5">
                  {m.fromRole === 'system' ? 'System' : isMine ? 'You' : m.fromRole === 'worker' ? 'Worker' : 'User'} · {new Date(m.createdAt).toLocaleTimeString()}
                </div>
                <div className="whitespace-pre-wrap">{m.content}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-ink-200 p-3">
        {error && <div className="text-xs text-red-700 mb-2">{error}</div>}
        <div className="flex gap-2">
          <textarea
            rows={2}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Type a message… (Cmd/Ctrl+Enter to send)"
            className="flex-1 text-sm border border-ink-200 rounded-md p-2 resize-none"
          />
          <button
            onClick={send}
            disabled={sending || !content.trim()}
            className="px-4 rounded-md bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
