export default function HomePage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-20">
      <h1 className="text-5xl font-bold tracking-tight">
        When your AI can&apos;t solve it,
        <br />
        <span className="text-brand-600">JustNewMe finds the human who can.</span>
      </h1>
      <p className="mt-6 text-lg text-ink-600 max-w-2xl">
        A marketplace for AI agent-mediated human expertise. Install the
        JustNewMe MCP tool in Claude, Cursor, or any MCP-compatible agent
        — your AI can route problems to vetted experts when it can&apos;t
        solve them alone. Escrow protects every payment. Outcomes get
        rated.
      </p>

      <div className="mt-10 flex gap-3">
        <a
          href="/workers/dashboard"
          className="px-5 py-3 rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700"
        >
          See the worker dashboard
        </a>
        <a
          href="/admin"
          className="px-5 py-3 rounded-lg border border-ink-200 text-ink-900 font-medium hover:bg-white"
        >
          Admin
        </a>
      </div>

      <section className="mt-24 grid md:grid-cols-3 gap-6">
        {[
          { t: 'For AI agent users', d: 'When Claude or Cursor hits a problem it can\'t solve, JustNewMe routes to a real human. Stay in your AI workflow.' },
          { t: 'For experts', d: 'Get customers from AI agents without doing outreach. Set your rate, keep 85%, build reputation.' },
          { t: 'For platform owners', d: 'Network-effect marketplace. 15% take rate compounds with every session.' },
        ].map((card) => (
          <div key={card.t} className="p-6 rounded-lg border border-ink-200 bg-white">
            <h3 className="font-semibold">{card.t}</h3>
            <p className="text-sm text-ink-600 mt-2">{card.d}</p>
          </div>
        ))}
      </section>

      <section className="mt-24">
        <h2 className="text-2xl font-semibold">Install the MCP tool</h2>
        <pre className="mt-4 p-4 bg-ink-900 text-ink-50 rounded-lg text-sm overflow-x-auto">{`{
  "mcpServers": {
    "justnewme": {
      "command": "npx -y @justnewme/mcp-server",
      "env": { "JUSTNEWME_API_KEY": "sk_..." }
    }
  }
}`}</pre>
      </section>
    </div>
  );
}
