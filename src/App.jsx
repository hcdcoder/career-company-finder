import { useState, useRef } from "react";

// ─── EMAILJS CONFIG ────────────────────────────────────────────────────────────
const EMAILJS_SERVICE_ID  = "YOUR_SERVICE_ID";
const EMAILJS_TEMPLATE_ID = "YOUR_TEMPLATE_ID";
const EMAILJS_PUBLIC_KEY  = "YOUR_PUBLIC_KEY";
const NOTIFY_EMAIL        = "hello@hercareerdoctor.com";
// ──────────────────────────────────────────────────────────────────────────────

const C = {
  headerBg: "#6E3611",
  accent:   "#FE9569",
  darkBrown:"#6E3611",
  medBrown: "#98543C",
  sage:     "#CDD0B9",
  rust:     "#B04521",
  cream:    "#F9F0E8",
  blush:    "#DEB09A",
  forest:   "#4B553A",
};

const INDUSTRIES = [
  "Healthcare Administration",
  "Higher Education",
  "Nonprofit & Social Impact",
  "Tech & SaaS",
  "Financial Services",
  "Consulting & Strategy",
  "Government & Public Policy",
  "Human Resources & People Ops",
  "Marketing & Communications",
  "Operations & Supply Chain",
  "Legal & Compliance",
  "Pharmaceutical & Biotech",
  "Mental Health & Counseling",
  "K-12 Education",
  "Real Estate & Property Management",
  "Other",
];

const LEVELS = [
  "Manager / Team Lead",
  "Senior Individual Contributor",
  "Director",
  "VP / Executive",
  "Any Level",
];

const SYSTEM_PROMPT = `You are a job search strategist inside a career coaching program called Find Your Fulfilling Career (FYFC), created by Dr. Tega Edwin (Her Career Doctor).

Your job is to find 10 real companies that are actively hiring on their own career pages — NOT from job boards like Indeed, LinkedIn, or Glassdoor — for roles that match the client's résumé and target industry.

INSTRUCTIONS:
1. Read the résumé carefully. Extract the top 5 transferable skills and 2-3 relevant job titles this person is qualified for.
2. Use web search to find companies in the specified industry that have active openings on their company career pages matching this person's background.
3. Focus on companies that post jobs on their own careers site (e.g. company.com/careers), not aggregators.
4. Return EXACTLY 10 companies.

RESPOND ONLY WITH A VALID JSON OBJECT — no preamble, no markdown, no backticks. Follow this exact structure:
{
  "skills": ["skill1","skill2","skill3","skill4","skill5"],
  "titles": ["title1","title2","title3"],
  "companies": [
    {
      "name": "Company Name",
      "careersUrl": "https://company.com/careers",
      "roles": ["Role Title 1","Role Title 2"],
      "whyItFits": "One sentence explaining why this company is a strong match for this person's background.",
      "hiringSignal": "Brief note on what signals they are actively hiring."
    }
  ]
}`;

async function sendEmailNotification(customIndustry, level) {
  if (
    EMAILJS_SERVICE_ID  === "YOUR_SERVICE_ID"  ||
    EMAILJS_TEMPLATE_ID === "YOUR_TEMPLATE_ID" ||
    EMAILJS_PUBLIC_KEY  === "YOUR_PUBLIC_KEY"
  ) {
    console.log("EmailJS not configured yet — skipping notification.");
    return;
  }
  try {
    const { send } = await import("https://cdn.jsdelivr.net/npm/@emailjs/browser@4/+esm");
    await send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      {
        to_email:        NOTIFY_EMAIL,
        custom_industry: customIndustry,
        level:           level,
        timestamp:       new Date().toLocaleString("en-US", {
          month: "long", day: "numeric", year: "numeric",
          hour: "numeric", minute: "2-digit", timeZoneName: "short",
        }),
      },
      EMAILJS_PUBLIC_KEY
    );
  } catch (err) {
    console.error("EmailJS notification failed:", err);
  }
}

export default function CareerCompanyFinder() {
  const [resume,        setResume]        = useState(null);
  const [resumeName,    setResumeName]    = useState("");
  const [industry,      setIndustry]      = useState("");
  const [otherIndustry, setOtherIndustry] = useState("");
  const [level,         setLevel]         = useState("");
  const [loading,       setLoading]       = useState(false);
  const [results,       setResults]       = useState(null);
  const [error,         setError]         = useState("");
  const [loadingMsg,    setLoadingMsg]    = useState("");
  const fileRef = useRef();

  const loadingMessages = [
    "Reading your résumé...",
    "Extracting your transferable skills...",
    "Searching career pages in your target industry...",
    "Filtering for active hiring signals...",
    "Matching roles to your background...",
    "Almost there — building your company list...",
  ];

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setResumeName(file.name);
    const reader = new FileReader();
    reader.onload = () => setResume({ data: reader.result.split(",")[1], type: file.type });
    reader.readAsDataURL(file);
  };

  const effectiveIndustry = industry === "Other" ? otherIndustry.trim() : industry;

  const handleSearch = async () => {
    if (!resume || !effectiveIndustry || !level) {
      setError("Please upload your résumé, select an industry, and choose a level.");
      return;
    }
    setError("");
    setResults(null);
    setLoading(true);

    if (industry === "Other" && otherIndustry.trim()) {
      sendEmailNotification(otherIndustry.trim(), level);
    }

    let idx = 0;
    setLoadingMsg(loadingMessages[0]);
    const interval = setInterval(() => {
      idx = (idx + 1) % loadingMessages.length;
      setLoadingMsg(loadingMessages[idx]);
    }, 3000);

    try {
      const res = await fetch("/api/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json", "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-allow-browser": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          system: SYSTEM_PROMPT,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: resume.type || "application/pdf",
                  data: resume.data,
                },
              },
              {
                type: "text",
                text: `Target industry: ${effectiveIndustry}\nSeniority level: ${level}\n\nFind 10 companies actively hiring on their career pages for roles matching this résumé.`,
              },
            ],
          }],
        }),
      });

      const data = await res.json();
      clearInterval(interval);

      const text = data.content
        ?.filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      if (!text) throw new Error("No response received.");
      setResults(JSON.parse(text.replace(/```json|```/g, "").trim()));
    } catch (err) {
      clearInterval(interval);
      setError("Something went wrong. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  };

  const reset = () => {
    setResults(null);
    setResume(null);
    setResumeName("");
    setIndustry("");
    setOtherIndustry("");
    setLevel("");
    setError("");
  };

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: "100vh", background: C.cream, color: C.darkBrown }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sacramento&family=DM+Sans:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .hdr { background: ${C.headerBg}; padding: 22px 36px; display: flex; align-items: center; gap: 14px; }
        .hdr-dot { width: 38px; height: 38px; background: ${C.accent}; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .hdr-title { color: ${C.cream}; font-family: 'Sacramento', cursive; font-size: 28px; line-height: 1.1; }
        .hdr-sub { color: rgba(249,240,232,0.6); font-size: 11px; letter-spacing: 1.8px; text-transform: uppercase; margin-top: 3px; }
        .main { max-width: 700px; margin: 0 auto; padding: 44px 24px; }
        .intro { margin-bottom: 36px; }
        .intro h2 { font-size: 28px; font-weight: 700; color: ${C.darkBrown}; line-height: 1.3; margin-bottom: 10px; }
        .intro p { font-size: 15px; color: ${C.medBrown}; line-height: 1.75; font-weight: 300; }
        .card { background: #fff; border: 1px solid ${C.blush}; border-radius: 14px; padding: 28px; margin-bottom: 16px; }
        .lbl { font-size: 11px; font-weight: 500; letter-spacing: 1.8px; text-transform: uppercase; color: ${C.medBrown}; margin-bottom: 10px; display: block; }
        .upload-zone { border: 1.5px dashed ${C.blush}; border-radius: 10px; padding: 30px; text-align: center; cursor: pointer; transition: all .2s; background: ${C.cream}; }
        .upload-zone:hover { border-color: ${C.accent}; background: #FFF3EE; }
        .upload-zone.filled { border-color: ${C.forest}; border-style: solid; background: #F2F4EE; }
        .upload-text { font-size: 14px; color: ${C.medBrown}; }
        .upload-hint { font-size: 12px; color: ${C.blush}; margin-top: 5px; }
        .upload-name { font-size: 13px; color: ${C.forest}; font-weight: 500; margin-top: 6px; }
        select, .other-input { width: 100%; padding: 13px 16px; border: 1px solid ${C.blush}; border-radius: 8px; font-size: 14px; font-family: 'DM Sans', sans-serif; color: ${C.darkBrown}; transition: border-color .2s; }
        select { appearance: none; background: ${C.cream}; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2398543C' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 16px center; cursor: pointer; }
        select:focus, .other-input:focus { outline: none; border-color: ${C.accent}; }
        .other-input { margin-top: 10px; background: ${C.cream}; }
        .other-input::placeholder { color: ${C.blush}; }
        .btn { width: 100%; padding: 17px; background: ${C.headerBg}; color: ${C.cream}; border: none; border-radius: 10px; font-size: 15px; font-weight: 500; cursor: pointer; transition: all .2s; margin-top: 6px; font-family: 'DM Sans', sans-serif; }
        .btn:hover:not(:disabled) { background: ${C.medBrown}; }
        .btn:disabled { opacity: .4; cursor: not-allowed; }
        .err { background: #FEF0EE; border: 1px solid ${C.accent}; border-radius: 8px; padding: 13px 18px; color: ${C.rust}; font-size: 13px; margin-bottom: 18px; }
        .loading-state { text-align: center; padding: 64px 20px; }
        .spinner { width: 44px; height: 44px; border: 2px solid ${C.blush}; border-top-color: ${C.accent}; border-radius: 50%; animation: spin .9s linear infinite; margin: 0 auto 22px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .loading-msg { font-size: 16px; color: ${C.medBrown}; font-weight: 300; }
        .loading-hint { font-size: 12px; color: ${C.blush}; margin-top: 8px; }
        .results-header { margin-bottom: 28px; }
        .results-header h2 { font-size: 26px; font-weight: 700; color: ${C.darkBrown}; margin-bottom: 6px; }
        .results-meta { font-size: 14px; color: ${C.medBrown}; font-weight: 300; }
        .results-meta strong { color: ${C.forest}; font-weight: 500; }
        .tags-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0 28px; }
        .skill-tag { background: #F2F4EE; border: 1px solid ${C.sage}; color: ${C.forest}; font-size: 12px; font-weight: 500; padding: 5px 12px; border-radius: 20px; }
        .title-tag { background: #FFF3EE; border: 1px solid ${C.accent}; color: ${C.darkBrown}; font-size: 12px; font-weight: 500; padding: 5px 12px; border-radius: 20px; }
        .divider { height: 1px; background: ${C.blush}; margin: 24px 0; opacity: .5; }
        .sec-lbl { font-size: 11px; font-weight: 500; letter-spacing: 1.8px; text-transform: uppercase; color: ${C.medBrown}; margin-bottom: 14px; }
        .co-card { background: #fff; border: 1px solid ${C.blush}; border-left: 4px solid ${C.accent}; border-radius: 14px; padding: 24px; margin-bottom: 14px; transition: box-shadow .2s; }
        .co-card:hover { box-shadow: 0 4px 18px rgba(110,54,17,.08); }
        .co-num { font-size: 11px; font-weight: 500; letter-spacing: 1.5px; color: ${C.accent}; text-transform: uppercase; margin-bottom: 5px; }
        .co-name { font-size: 20px; font-weight: 700; color: ${C.darkBrown}; margin-bottom: 12px; }
        .roles-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
        .role-pill { background: ${C.cream}; border: 1px solid ${C.blush}; color: ${C.medBrown}; font-size: 12px; padding: 4px 11px; border-radius: 6px; }
        .co-why { font-size: 14px; color: ${C.darkBrown}; line-height: 1.65; margin-bottom: 12px; font-style: italic; border-left: 2px solid ${C.accent}; padding-left: 14px; }
        .co-signal { font-size: 12px; color: ${C.medBrown}; line-height: 1.5; }
        .co-signal strong { color: ${C.rust}; }
        .co-link { display: inline-flex; align-items: center; gap: 6px; margin-top: 14px; font-size: 13px; font-weight: 500; color: ${C.forest}; text-decoration: none; border-bottom: 1px solid ${C.sage}; padding-bottom: 1px; transition: color .2s; }
        .co-link:hover { color: ${C.accent}; border-bottom-color: ${C.accent}; }
        .reset-btn { width: 100%; padding: 15px; background: transparent; color: ${C.medBrown}; border: 1px solid ${C.blush}; border-radius: 10px; font-size: 14px; cursor: pointer; margin-top: 10px; transition: all .2s; font-family: 'DM Sans', sans-serif; }
        .reset-btn:hover { border-color: ${C.darkBrown}; color: ${C.darkBrown}; }
      `}</style>

      <div className="hdr">
        <div className="hdr-dot">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
        </div>
        <div>
          <div className="hdr-title">Career Company Finder</div>
          <div className="hdr-sub">Find Your Fulfilling Career · FYFC Tool</div>
        </div>
      </div>

      <div className="main">
        {!loading && !results && (
          <>
            <div className="intro">
              <h2>Find companies actively hiring for roles that fit you.</h2>
              <p>Upload your résumé, choose your target industry, and this tool will search company career pages — not job boards — to find 10 organizations with active openings that match your background.</p>
            </div>

            {error && <div className="err">{error}</div>}

            <div className="card">
              <span className="lbl">Your résumé</span>
              <div className={`upload-zone ${resume ? "filled" : ""}`} onClick={() => fileRef.current.click()}>
                <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={handleFile} />
                {resume ? (
                  <>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>✓</div>
                    <div className="upload-name">{resumeName}</div>
                    <div className="upload-hint" style={{ color: C.forest }}>Uploaded — click to replace</div>
                  </>
                ) : (
                  <>
                    <svg style={{ width: 32, height: 32, margin: "0 auto 10px", display: "block", color: C.blush }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                    </svg>
                    <div className="upload-text">Click to upload your résumé</div>
                    <div className="upload-hint">PDF format only</div>
                  </>
                )}
              </div>
            </div>

            <div className="card">
              <span className="lbl">Target industry</span>
              <select value={industry} onChange={(e) => { setIndustry(e.target.value); setOtherIndustry(""); }}>
                <option value="">Select an industry...</option>
                {INDUSTRIES.map(ind => <option key={ind} value={ind}>{ind}</option>)}
              </select>
              {industry === "Other" && (
                <input
                  className="other-input"
                  type="text"
                  placeholder="Type your industry here..."
                  value={otherIndustry}
                  onChange={(e) => setOtherIndustry(e.target.value)}
                />
              )}
            </div>

            <div className="card">
              <span className="lbl">Seniority level</span>
              <select value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="">Select a level...</option>
                {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            <button className="btn" onClick={handleSearch} disabled={!resume || !effectiveIndustry || !level}>
              Find my 10 companies →
            </button>
          </>
        )}

        {loading && (
          <div className="loading-state">
            <div className="spinner" />
            <div className="loading-msg">{loadingMsg}</div>
            <div className="loading-hint">Searching company career pages — this takes about 30–60 seconds.</div>
          </div>
        )}

        {results && !loading && (
          <>
            <div className="results-header">
              <h2>Your 10 target companies</h2>
              <p className="results-meta">Industry: <strong>{effectiveIndustry}</strong>&nbsp;·&nbsp;Level: <strong>{level}</strong></p>
            </div>
            <div className="sec-lbl">Extracted from your résumé</div>
            <div className="tags-row">
              {results.skills?.map((s, i) => <span key={i} className="skill-tag">{s}</span>)}
              {results.titles?.map((t, i) => <span key={i} className="title-tag">{t}</span>)}
            </div>
            <div className="divider" />
            {results.companies?.map((c, i) => (
              <div key={i} className="co-card">
                <div className="co-num">Company {String(i + 1).padStart(2, "0")}</div>
                <div className="co-name">{c.name}</div>
                <div className="roles-row">
                  {c.roles?.map((r, j) => <span key={j} className="role-pill">{r}</span>)}
                </div>
                <div className="co-why">{c.whyItFits}</div>
                {c.hiringSignal && <div className="co-signal"><strong>Hiring signal:</strong> {c.hiringSignal}</div>}
                {c.careersUrl && (
                  <a href={c.careersUrl} target="_blank" rel="noopener noreferrer" className="co-link">
                    View careers page
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 11L11 1M11 1H4M11 1v7"/>
                    </svg>
                  </a>
                )}
              </div>
            ))}
            <button className="reset-btn" onClick={reset}>Start a new search</button>
          </>
        )}
      </div>
    </div>
  );
}
