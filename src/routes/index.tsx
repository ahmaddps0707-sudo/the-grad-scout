import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "The Grad Scout — Find Your Master's Program, Not Just a List" },
      { name: "description", content: "The Grad Scout researches master's programs that match your profile, scores each one on fit, and tracks every application from first shortlist to final decision. Built for international students applying abroad." },
      { property: "og:title", content: "The Grad Scout — Find Your Master's Program" },
      { property: "og:description", content: "AI-powered research, application tracking, and alumni outreach for international master's applicants." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://thegradscout.com" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "The Grad Scout — Find Your Master's Program" },
      { name: "twitter:description", content: "AI-powered research, application tracking, and alumni outreach for international master's applicants." },
      { property: "og:image", content: "https://thegradscout.com/og-image.png" },
      { name: "twitter:image", content: "https://thegradscout.com/og-image.png" },
    ],
    links: [
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Inter:wght@400;500;600;700&display=swap" },
      { rel: "canonical", href: "https://thegradscout.com" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              name: "The Grad Scout",
              url: "https://thegradscout.com",
              logo: "https://thegradscout.com/icon-512.png",
              description:
                "AI-powered master's program research, fit scoring, and application tracking for international students.",
            },
            {
              "@type": "WebSite",
              name: "The Grad Scout",
              url: "https://thegradscout.com",
              description:
                "Research, score, and track master's program applications abroad.",
            },
          ],
        }),
      },
    ],
  }),
  component: GradScoutLanding,
});

const NAV = "#0A1220";
const BG = "#FAF9F4";
const BG2 = "#F0EBDE";
const AMBER = "#C9A24B";
const BLUE = "#3B5BDB";
const TEXT = "#15172A";
const MUTED = "#6B7280";
const BORDER = "#E7E1D2";
const WHITE = "#FFFFFF";
const GREEN = "#10B981";

const faqs = [
  { q: "How does The Grad Scout find universities for me?", a: "After a short preferences form — your field, target countries, GPA, test scores, and budget — The Grad Scout uses AI and live web search to research and score matching master's programs. Each program gets a 0–100 fit score based on your specific profile, not generic rankings." },
  { q: "Is the university data current?", a: "Yes. The Grad Scout fetches live web data every time a university is enriched, pulling current admissions deadlines, tuition, class profiles, and career outcomes from official sources. You can also manually refresh any university's data at any time." },
  { q: "What's the difference between Free and Pro?", a: "Free gives you dashboard access, 3 university discovery runs, discussion forum, and the ability to save contacts. Pro ($10/month) unlocks the full contacts CRM, resume builder with AI assistance, 20 discovery runs per month, and 50 AI resume bullet suggestions." },
  { q: "Can I use The Grad Scout for MBA programs?", a: "Yes — MBA is a master's degree and The Grad Scout supports it fully. We cover MSc, MA, MEng, MBA, MPA, MPH, LLM, and all master's-level programs. PhD and bachelor's programs are not in scope." },
  { q: "How does the resume builder work?", a: "Upload your existing resume (PDF or DOCX) and The Grad Scout parses it into a structured editor. Edit all sections, save multiple versions for different programs, and use the AI assistant to strengthen bullets — based only on what you provide, never fabricated." },
  { q: "Can I connect with alumni from programs I'm targeting?", a: "Yes. Each university's Outreach tab surfaces publicly findable LinkedIn profiles of current students and recent graduates, prioritized by your home country. Save contacts and manage outreach across a five-stage board." },
  { q: "Is my data secure?", a: "Your resume and profile are stored with row-level security — only you can access your own data. We never share your information with universities or third parties." },
  { q: "Can I cancel my Pro subscription anytime?", a: "Yes. Cancel anytime from Settings. Your Pro access continues until the end of your current billing period — we don't cut access the moment you cancel." },
];

const features = [
  { icon: "🎯", title: "Smart University Research", desc: "Tell us your goals. Our AI researches and scores master's programs against your exact profile — field, country, tier, budget, test scores. Not just a ranking list." },
  { icon: "📊", title: "Live Admissions Data", desc: "Every card comes with current deadlines, GPA/GRE class profiles, tuition, funding availability, and career outcomes — pulled from official sources, not stale databases." },
  { icon: "📋", title: "Application Tracker", desc: "Move universities through stages — Shortlisted, Applied, Interview, Offer — see every deadline at a glance, and never lose track across 20 applications." },
  { icon: "🤝", title: "Alumni Outreach", desc: "Find current students and graduates from your target programs, prioritized by your home country. Manage outreach in a built-in five-stage contact board." },
  { icon: "📄", title: "Resume Builder", desc: "Upload your resume, edit in a structured layout, and use AI to sharpen your bullets. Save multiple versions tailored to different programs." },
  { icon: "💬", title: "Applicant Community", desc: "Ask questions, share your experience, and learn from peers going through the same process. A focused forum built for grad applicants, not a generic feed." },
];

const steps = [
  { num: "1", title: "Tell us your goals", desc: "Complete a short form — your field, target countries, GPA, test scores, and budget. Takes under 5 minutes." },
  { num: "2", title: "We research your matches", desc: "The Grad Scout finds and scores master's programs that fit your profile, pulling live admissions data, class profiles, and career outcomes for each one." },
  { num: "3", title: "Track, connect, and apply", desc: "Manage your shortlist, reach out to alumni, build your resume, and track every application through to your final decision." },
];

const serif = { fontFamily: "'Playfair Display', serif" as const };

function Wordmark({ dark = false }: { dark?: boolean }) {
  return (
    <span className="gs-logo" style={{ display: "flex", alignItems: "center", gap: 9, whiteSpace: "nowrap" }}>
      <span className="gs-logo-icon" style={{
        width: 30, height: 30, borderRadius: 8,
        background: dark ? "rgba(255,255,255,0.08)" : NAV,
        border: dark ? "1px solid rgba(255,255,255,0.14)" : "none",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 15, color: AMBER, flexShrink: 0,
      }}>🧭</span>
      <span className="gs-logo-text" style={{ ...serif, fontSize: 20, fontWeight: 900, color: dark ? WHITE : NAV, letterSpacing: "-0.4px", whiteSpace: "nowrap" }}><span className="gs-logo-the">The </span>Grad Scout</span>
    </span>
  );
}

function GradScoutLanding() {
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @keyframes gs-float1 { 0%,100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-12px) rotate(-2deg); } }
      @keyframes gs-float2 { 0%,100% { transform: translateY(0) rotate(1.5deg); } 50% { transform: translateY(-16px) rotate(1.5deg); } }
      @keyframes gs-float3 { 0%,100% { transform: translateY(0) rotate(-1deg); } 50% { transform: translateY(-8px) rotate(-1deg); } }
      .gs-f-card { transition: transform 0.2s, box-shadow 0.2s; }
      .gs-f-card:hover { transform: translateY(-4px); box-shadow: 0 16px 40px rgba(0,0,0,0.09) !important; }
      .gs-nav-a:hover { color: #3B5BDB !important; }
      .gs-btn-amber:hover { background: #A9822F !important; }
      .gs-faq-body { overflow: hidden; transition: max-height 0.3s ease, padding 0.3s ease; }
      .gs-root input:focus, .gs-root textarea:focus { border-color: #3B5BDB !important; box-shadow: 0 0 0 3px rgba(59,91,219,0.12); outline: none; }
      @media (max-width: 820px) {
        .gs-hero-inner { flex-direction: column !important; }
        .gs-hero-cards { display: none !important; }
        .gs-feat-grid { grid-template-columns: 1fr 1fr !important; }
        .gs-price-wrap { flex-direction: column !important; }
        .gs-steps-wrap { flex-direction: column !important; gap: 40px !important; }
        .gs-prob-grid { grid-template-columns: 1fr !important; }
      }
      @media (max-width: 520px) {
        .gs-feat-grid { grid-template-columns: 1fr !important; }
        .gs-nav-links { display: none !important; }
      }
      @media (max-width: 640px) {
        .gs-nav { padding: 0 4% !important; height: auto !important; min-height: 60px; flex-wrap: nowrap !important; }
        .gs-nav-links { display: none !important; }
        .gs-nav .gs-logo-text { font-size: 15px !important; }
        .gs-nav .gs-logo-icon { width: 26px !important; height: 26px !important; font-size: 13px !important; }
        .gs-nav-signin { display: none !important; }
        .gs-nav .gs-btn-amber { font-size: 13px !important; padding: 8px 14px !important; }
      }
      @media (max-width: 360px) {
        .gs-nav .gs-logo-text { font-size: 13px !important; }
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  const goAuth = (e?: React.MouseEvent) => { e?.preventDefault(); navigate({ to: "/auth" }); };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.from("contact_enquiries").insert({
      name: form.name.trim(),
      email: form.email.trim(),
      message: form.message.trim(),
    });
    setSubmitting(false);
    if (error) { toast.error("Couldn't send message. Please try again."); return; }
    setSubmitted(true);
  };

  return (
    <div className="gs-root" style={{ fontFamily: "'Inter', sans-serif", background: BG, color: TEXT }}>
      {/* NAV */}
      <nav className="gs-nav" style={{ position: "sticky", top: 0, zIndex: 200, background: "rgba(250,249,244,0.96)", backdropFilter: "blur(10px)", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 6%", height: 64 }}>
        <Wordmark />
        <div className="gs-nav-links" style={{ display: "flex", gap: 28, alignItems: "center" }}>
          {[["Features","#features"],["How it works","#how-it-works"],["Pricing","#pricing"],["FAQ","#faq"]].map(([l,h]) => (
            <a key={l} href={h} className="gs-nav-a" style={{ fontSize: 14, fontWeight: 500, color: TEXT, textDecoration: "none" }}>{l}</a>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <a href="/auth" onClick={goAuth} className="gs-nav-signin" style={{ fontSize: 14, fontWeight: 500, color: MUTED, textDecoration: "none", padding: "8px 14px", whiteSpace: "nowrap" }}>Sign in</a>
          <a href="/auth" onClick={goAuth} className="gs-btn-amber" style={{ fontSize: 14, fontWeight: 700, color: WHITE, background: AMBER, borderRadius: 8, padding: "9px 18px", textDecoration: "none", whiteSpace: "nowrap" }}>Get started free</a>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ background: NAV, padding: "96px 6% 80px", overflow: "hidden", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.07, background: "radial-gradient(ellipse at 70% 40%, #3B5BDB 0%, transparent 55%), radial-gradient(ellipse at 20% 80%, #C9A24B 0%, transparent 45%)" }} />
        <div className="gs-hero-inner" style={{ display: "flex", alignItems: "center", gap: 56, maxWidth: 1080, margin: "0 auto", position: "relative" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(59,91,219,0.15)", border: "1px solid rgba(59,91,219,0.3)", borderRadius: 100, padding: "6px 14px", marginBottom: 28 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ADE80" }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: "#93C5FD", letterSpacing: "0.07em", textTransform: "uppercase" }}>Built for international master's applicants</span>
            </div>
            <h1 style={{ ...serif, fontSize: "clamp(36px, 4.8vw, 58px)", fontWeight: 900, color: WHITE, lineHeight: 1.08, letterSpacing: "-1px", marginBottom: 26 }}>
              Find your program.<br />
              <em style={{ color: AMBER }}>Not just a list</em><br />
              of them.
            </h1>
            <p style={{ fontSize: 17, lineHeight: 1.75, color: "rgba(255,255,255,0.65)", marginBottom: 40, maxWidth: 460 }}>
              The Grad Scout researches master's programs that match your profile, scores each on fit, and tracks every application from first shortlist to final decision.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a href="/auth" onClick={goAuth} className="gs-btn-amber" style={{ fontSize: 15, fontWeight: 700, color: WHITE, background: AMBER, borderRadius: 10, padding: "14px 26px", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}>Start free — no card needed →</a>
              <a href="#how-it-works" style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.8)", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "14px 22px", textDecoration: "none" }}>See how it works</a>
            </div>
            <p style={{ marginTop: 20, fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Free plan available · Pro at $10/month · 7-day trial included · Cancel anytime</p>
          </div>
          <div className="gs-hero-cards" style={{ flex: "0 0 360px", position: "relative", height: 360 }}>
            {[
              { style: { top: 0, left: 24, animation: "gs-float1 4.2s ease-in-out infinite" }, uni: "Harvard Business School", prog: "MBA · Boston, MA · QS #1", score: "94", scoreBg: GREEN, status: "Planning to Apply", statusBg: "rgba(59,91,219,0.2)", statusDot: BLUE, statusText: "#93C5FD", w: 300 },
              { style: { top: 120, right: 0, animation: "gs-float2 5.5s ease-in-out infinite" }, uni: "London Business School", prog: "MiM · London, UK · QS #4", score: "88", scoreBg: "#3B82F6", status: "Application In Progress", statusBg: "rgba(201,162,75,0.18)", statusDot: AMBER, statusText: "#FCD34D", w: 280 },
              { style: { bottom: 0, left: 10, animation: "gs-float3 6s ease-in-out infinite" }, uni: "INSEAD", prog: "MBA · Fontainebleau · QS #3", score: "82", scoreBg: "#8B5CF6", status: "Offer Received ✓", statusBg: "rgba(16,185,129,0.18)", statusDot: GREEN, statusText: "#6EE7B7", w: 268 },
            ].map((c, i) => (
              <div key={i} style={{ position: "absolute", ...c.style, width: c.w, background: "rgba(255,255,255,0.055)", backdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.11)", borderRadius: 16, padding: "18px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
                    <div style={{ fontWeight: 700, color: WHITE, fontSize: 13, marginBottom: 3 }}>{c.uni}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{c.prog}</div>
                  </div>
                  <div style={{ background: c.scoreBg, color: WHITE, fontWeight: 800, fontSize: 13, borderRadius: 8, padding: "4px 10px", flexShrink: 0 }}>{c.score}</div>
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: c.statusBg, borderRadius: 100, padding: "4px 10px" }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: c.statusDot, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: c.statusText, fontWeight: 600, whiteSpace: "nowrap" }}>{c.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TRUST */}
      <section style={{ background: WHITE, borderBottom: `1px solid ${BORDER}`, padding: "18px 6%", textAlign: "center" }}>
        <p style={{ fontSize: 13, color: MUTED, fontWeight: 500 }}>
          Helping applicants target programs in the&nbsp;
          {["🇺🇸 US", "🇬🇧 UK", "🇨🇦 Canada", "🇩🇪 Germany", "🇦🇺 Australia", "🇳🇱 Netherlands", "🇸🇬 Singapore"].map((f, i, a) => (
            <span key={f}>{f}{i < a.length - 1 ? " · " : ""}</span>
          ))}
        </p>
      </section>

      {/* PROBLEM */}
      <section style={{ padding: "90px 6%", background: BG }}>
        <div style={{ maxWidth: 1040, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: BLUE, letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: 14 }}>The problem</p>
            <h2 style={{ ...serif, fontSize: "clamp(26px, 3.8vw, 42px)", fontWeight: 900, color: NAV, letterSpacing: "-0.5px", lineHeight: 1.18, marginBottom: 16 }}>
              Applying abroad is harder<br />than it should be
            </h2>
            <p style={{ fontSize: 16, color: MUTED, maxWidth: 480, margin: "0 auto", lineHeight: 1.75 }}>
              Most students navigate this alone — no advisor, no benchmarks, and a browser full of tabs that don't talk to each other.
            </p>
          </div>
          <div className="gs-prob-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
            {[
              { icon: "⏱", title: "Weeks lost to research", desc: "Hunting for programs across spreadsheets, Reddit, and university websites — before you've even looked at a single deadline or class profile average." },
              { icon: "❓", title: "No idea if you're competitive", desc: "Average GPA and test score data is buried in PDFs. By the time you find it, you've shortlisted programs that were never realistic fits." },
              { icon: "🌍", title: "No one to ask", desc: "Local advisors don't know international programs. And finding someone from your country who went through the same program? That's a research project of its own." },
            ].map((p, i) => (
              <div key={i} style={{ background: WHITE, borderRadius: 16, padding: "28px 24px", border: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: 30, marginBottom: 16 }}>{p.icon}</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: NAV, marginBottom: 10 }}>{p.title}</h3>
                <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.75 }}>{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW */}
      <section id="how-it-works" style={{ background: NAV, padding: "90px 6%" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#93C5FD", letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: 14 }}>How it works</p>
            <h2 style={{ ...serif, fontSize: "clamp(26px, 3.8vw, 42px)", fontWeight: 900, color: WHITE, letterSpacing: "-0.5px", lineHeight: 1.18 }}>
              From zero to shortlist<br />in one afternoon
            </h2>
          </div>
          <div className="gs-steps-wrap" style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
            {steps.map((s, i) => (
              <div key={i} style={{ flex: 1, textAlign: "center", padding: "0 16px" }}>
                <div style={{ ...serif, fontSize: 52, fontWeight: 900, lineHeight: 1, marginBottom: 20, background: `linear-gradient(135deg, rgba(59,91,219,0.5), rgba(201,162,75,0.3))`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{s.num}</div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: WHITE, marginBottom: 12 }}>{s.title}</h3>
                <p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", lineHeight: 1.8 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" style={{ padding: "90px 6%", background: BG }}>
        <div style={{ maxWidth: 1060, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: BLUE, letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: 14 }}>Everything you need</p>
            <h2 style={{ ...serif, fontSize: "clamp(26px, 3.8vw, 42px)", fontWeight: 900, color: NAV, letterSpacing: "-0.5px", lineHeight: 1.18, marginBottom: 16 }}>
              One platform,<br />the whole journey
            </h2>
            <p style={{ fontSize: 16, color: MUTED, maxWidth: 460, margin: "0 auto", lineHeight: 1.75 }}>
              Every tool international master's applicants need — in one place, not scattered across twelve tabs.
            </p>
          </div>
          <div className="gs-feat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
            {features.map((f, i) => (
              <div key={i} className="gs-f-card" style={{ background: WHITE, borderRadius: 16, padding: "28px 24px", border: `1px solid ${BORDER}`, boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
                <div style={{ fontSize: 28, marginBottom: 14 }}>{f.icon}</div>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: NAV, marginBottom: 10 }}>{f.title}</h2>
                <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.8 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ padding: "90px 6%", background: BG2 }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: BLUE, letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: 14 }}>Pricing</p>
            <h2 style={{ ...serif, fontSize: "clamp(26px, 3.8vw, 42px)", fontWeight: 900, color: NAV, letterSpacing: "-0.5px", lineHeight: 1.18 }}>
              Simple, honest pricing
            </h2>
          </div>
          <div className="gs-price-wrap" style={{ display: "flex", gap: 20, alignItems: "stretch" }}>
            <div style={{ flex: 1, background: WHITE, borderRadius: 20, padding: 36, border: `1px solid ${BORDER}` }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Free</p>
              <div style={{ marginBottom: 28 }}>
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 46, fontWeight: 800, color: NAV, letterSpacing: "-0.02em" }}>$0</span>
                <span style={{ color: MUTED, fontSize: 14 }}> forever</span>
              </div>
              {["Dashboard & university cards", "3 discovery runs", "Discussion forum", "Save contacts from program pages"].map((x, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12 }}>
                  <span style={{ color: GREEN, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span>
                  <span style={{ fontSize: 14, color: TEXT, lineHeight: 1.5 }}>{x}</span>
                </div>
              ))}
              {["Contacts CRM", "Resume builder"].map((x, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12 }}>
                  <span style={{ color: BORDER, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✗</span>
                  <span style={{ fontSize: 14, color: "#C4C0B8", lineHeight: 1.5 }}>{x}</span>
                </div>
              ))}
              <a href="/auth" onClick={goAuth} style={{ display: "block", textAlign: "center", marginTop: 28, fontSize: 14, fontWeight: 600, color: NAV, border: `2px solid ${BORDER}`, borderRadius: 10, padding: "13px", textDecoration: "none" }}>Get started free</a>
            </div>
            <div style={{ flex: 1, background: NAV, borderRadius: 20, padding: 36, border: `2px solid ${AMBER}`, position: "relative" }}>
              <div style={{ position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)", background: AMBER, color: WHITE, fontSize: 10, fontWeight: 800, padding: "5px 16px", borderRadius: 100, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>Most popular</div>
              <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Pro</p>
              <div style={{ marginBottom: 28 }}>
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 46, fontWeight: 800, color: WHITE, letterSpacing: "-0.02em" }}>$10</span>
                <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 14 }}> / month</span>
              </div>
              {["Everything in Free", "20 discovery runs / month", "Full contacts CRM", "Resume builder", "50 AI resume bullets / month", "7-day free trial — no card needed"].map((x, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12 }}>
                  <span style={{ color: AMBER, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span>
                  <span style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", lineHeight: 1.5 }}>{x}</span>
                </div>
              ))}
              <a href="/auth" onClick={goAuth} className="gs-btn-amber" style={{ display: "block", textAlign: "center", marginTop: 28, fontSize: 14, fontWeight: 700, color: WHITE, background: AMBER, borderRadius: 10, padding: "14px", textDecoration: "none" }}>Start 7-day free trial →</a>
              <p style={{ textAlign: "center", marginTop: 12, fontSize: 11, color: "rgba(255,255,255,0.35)" }}>No credit card required during trial</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" style={{ padding: "90px 6%", background: BG }}>
        <div style={{ maxWidth: 660, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: BLUE, letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: 14 }}>FAQ</p>
            <h2 style={{ ...serif, fontSize: "clamp(26px, 3.8vw, 40px)", fontWeight: 900, color: NAV, letterSpacing: "-0.5px", lineHeight: 1.18 }}>
              Questions we get asked
            </h2>
          </div>
          <div>
            {faqs.map((f, i) => (
              <div key={i} style={{ background: WHITE, borderRadius: 12, border: `1px solid ${BORDER}`, marginBottom: 8, overflow: "hidden" }}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", gap: 16 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: NAV, flex: 1, lineHeight: 1.4 }}>{f.q}</span>
                  <span style={{ fontSize: 22, color: BLUE, fontWeight: 300, flexShrink: 0, lineHeight: 1, transform: openFaq === i ? "rotate(45deg)" : "none", transition: "transform 0.2s ease", display: "block" }}>+</span>
                </button>
                <div className="gs-faq-body" style={{ maxHeight: openFaq === i ? 500 : 0, padding: openFaq === i ? "0 24px 22px" : "0 24px" }}>
                  <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.85 }}>{f.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" style={{ padding: "90px 6% 50px", background: BG2 }}>
        <div style={{ maxWidth: 580, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: BLUE, letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: 14 }}>Get in touch</p>
            <h2 style={{ ...serif, fontSize: "clamp(26px, 3.8vw, 40px)", fontWeight: 900, color: NAV, letterSpacing: "-0.5px", lineHeight: 1.18, marginBottom: 14 }}>
              Have a question?
            </h2>
            <p style={{ fontSize: 16, color: MUTED, lineHeight: 1.75 }}>We read every message and reply within 24 hours.</p>
          </div>
          {submitted ? (
            <div style={{ background: WHITE, borderRadius: 20, padding: "56px 40px", textAlign: "center", border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 44, marginBottom: 16 }}>✅</div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: NAV, marginBottom: 10 }}>Message received</h3>
              <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.75 }}>Thanks for reaching out. We'll be back within 24 hours.</p>
            </div>
          ) : (
            <form onSubmit={submitForm} style={{ background: WHITE, borderRadius: 20, padding: 40, border: `1px solid ${BORDER}`, display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: NAV, marginBottom: 8 }}>Your name</label>
                <input type="text" placeholder="Sarah" required maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ width: "100%", padding: "12px 16px", border: `1px solid ${BORDER}`, borderRadius: 10, fontSize: 14, color: TEXT, fontFamily: "Inter, sans-serif", background: "#FAFAF8" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: NAV, marginBottom: 8 }}>Email address</label>
                <input type="email" placeholder="you@example.com" required maxLength={255} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={{ width: "100%", padding: "12px 16px", border: `1px solid ${BORDER}`, borderRadius: 10, fontSize: 14, color: TEXT, fontFamily: "Inter, sans-serif", background: "#FAFAF8" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: NAV, marginBottom: 8 }}>Message</label>
                <textarea rows={4} placeholder="Tell us what's on your mind..." required maxLength={2000} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} style={{ width: "100%", padding: "12px 16px", border: `1px solid ${BORDER}`, borderRadius: 10, fontSize: 14, color: TEXT, fontFamily: "Inter, sans-serif", background: "#FAFAF8", resize: "vertical" }} />
              </div>
              <button type="submit" disabled={submitting} className="gs-btn-amber" style={{ width: "100%", padding: "14px", background: AMBER, color: WHITE, fontWeight: 700, fontSize: 15, border: "none", borderRadius: 10, cursor: submitting ? "not-allowed" : "pointer", fontFamily: "Inter, sans-serif", opacity: submitting ? 0.7 : 1 }}>
                {submitting ? "Sending..." : "Send message →"}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: NAV, padding: "48px 6% 28px" }}>
        <div style={{ maxWidth: 1060, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 40, marginBottom: 28 }}>
            <div>
              <Wordmark dark />
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginTop: 12, maxWidth: 230, lineHeight: 1.75 }}>
                The research and tracking platform built for international master's applicants.
              </p>
            </div>
            <div style={{ display: "flex", gap: 60, flexWrap: "wrap" }}>
              {[
                { title: "Product", links: [["Features","#features"],["How it works","#how-it-works"],["Pricing","#pricing"],["FAQ","#faq"]] as [string,string][] },
                { title: "Company", links: [["Contact","#contact"]] as [string,string][] },
              ].map(col => (
                <div key={col.title}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 16 }}>{col.title}</p>
                  {col.links.map(([l,h]) => (
                    <a key={l} href={h} style={{ display: "block", fontSize: 14, color: "rgba(255,255,255,0.55)", textDecoration: "none", marginBottom: 10 }}>{l}</a>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 18, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>© 2026 The Grad Scout. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}