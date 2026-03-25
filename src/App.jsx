import { useState } from "react";

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

function buildSystemPrompt(jobTitle, industry, level) {
  return `You are a job search strategist inside a career coaching program called Find Your Fulfilling Career (FYFC), created by Dr. Tega Edwin (Her Career Doctor).

Your job is to find 10 real companies that are actively hiring on their own career pages — NOT from job boards like Indeed, LinkedIn, or Glassdoor — for roles matching the job title "${jobTitle}" (or equivalent/synonym titles) in the ${industry} industry at the ${level} seniority level.

INSTRUCTIONS:
1. First, identify 3-6 synonym or equivalent job titles for "${jobTitle}" in the ${industry} industry. Think about what different companies might call this same type of role.
2. Use web search to find companies in the ${industry} industry that have active openings on their company career pages matching "${jobTitle}" or any of the synonym titles you identified.
3. Focus on companies that post jobs on their own careers site (e.g. company.com/careers), not aggregators.
4. Return EXACTLY 10 companies.

RESPOND ONLY WITH A VALID JSON OBJECT — no preamble, no markdown, no backticks. Follow this exact structure:
{
  "synonymTitles": ["synonym1", "synonym2", "synonym3"],
  "companies": [
    {
      "name": "Company Name",
      "careersUrl": "https://company.com/careers",
      "roles": ["Role Title 1", "Role Title 2"],
      "whyItFits": "One sentence explaining why this company is a strong match.",
      "hiringSignal": "Brief note on what signals they are actively hiring."
    }
  ]
}`;
}

export default function CareerCompanyFinder() {
  const [jobTitle,    setJobTitle]    = useState("");
  const [industries,  setIndustries]  = useState([{ value: "", other: "" }]);
  const [level,       setLevel]       = useState("");
  const [loading,     setLoading]     = useState(false);
  const [results,     setResults]     = useState(null);
  const [error,       setError]       = useState("");
  const [loadingMsg,  setLoadingMsg]  = useState("");
  const [progress,    setProgress]    = useState({ current: 0, total: 0, industry: "" });

  const loadingMessages = [
    "Identifying synonym job titles...",
    "Searching career pages in your target industry...",
    "Filtering for active hiring signals...",
    "Matching roles to your job title...",
    "Almost there — building your company list...",
  ];

  const addIndustry = () => {
    if (industries.length < 3) {
      setIndustries([...industries, { value: "", other: "" }]);
    }
  };

  const removeIndustry = (idx) => {
    setIndustries(industries.filter((_, i) => i !== idx));
  };

  const updateIndustry = (idx, field, val) => {
    const updated = [...industries];
    updated[idx] = { ...updated[idx], [field]: val };
    if (field === "value") updated[idx].other = "";
    setIndustries(updated);
  };

  const getEffectiveIndustries = () =>
    industries
      .map((ind) => (ind.value === "Other" ? ind.other.trim() : ind.value))
      .filter(Boolean);

  const canSearch = () => {
    return jobTitle.trim() && getEffectiveIndustries().length > 0 && level;
  };

  const handleSearch = async () => {
    const effectiveIndustries = getEffectiveIndustries();
    if (!jobTitle.trim() || effectiveIndustries.length === 0 || !level) {
      setError("Please enter a job title, select at least one industry, and choose a level.");
      return;
    }
    setError("");
    setResults(null);
    setLoading(true);

    const allResults = [];
    const allSynonyms = new Set();
    let hasError = false;

    setProgress({ current: 0, total: effectiveIndustries.length, industry: "" });

    for (let i = 0; i < effectiveIndustries.length; i++) {
      const industry = effectiveIndustries[i];
      setProgress({ current: i + 1, total: effectiveIndustries.length, industry });

      let msgIdx = 0;
      setLoadingMsg(loadingMessages[0]);
      const interval = setInterval(() => {
        msgIdx = (msgIdx + 1) % loadingMessages.length;
        setLoadingMsg(loadingMessages[msgIdx]);
      }, 3500);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 5000,
            system: buildSystemPrompt(jobTitle.trim(), industry, level),
            tools: [{ type: "web_search_20250305", name: "web_search" }],
            messages: [{
              role: "user",
              content: `Find 10 companies in the ${industry} industry that are actively hiring on their career pages for "${jobTitle.trim()}" or equivalent roles at the ${level} level. Return the JSON now.`,
            }],
          }),
        });

        const data = await res.json();
        clearInterval(interval);

        if (!res.ok) {
          if (res.status === 429) throw new Error("rate_limit");
          throw new Error(data.error?.message || "API request failed.");
        }

        const textBlocks = data.content?.filter((b) => b.type === "text") || [];
        const lastText = textBlocks[textBlocks.length - 1]?.text;
        if (!lastText) throw new Error("No response received.");

        const cleaned = lastText.replace(/```json|```/g, "").trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Could not find JSON in response.");

        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.synonymTitles) {
          parsed.synonymTitles.forEach((t) => allSynonyms.add(t));
        }
        allResults.push({ industry, ...parsed });
      } catch (err) {
        clearInterval(interval);
        console.error(`Error searching ${industry}:`, err);
        if (err.message === "rate_limit") {
          setError("We're getting too many requests right now — please wait a minute and try again.");
          hasError = true;
          break;
        }
        allResults.push({ industry, companies: [], synonymTitles: [], error: true });
      }
    }

    if (!hasError) {
      setResults({
        jobTitle: jobTitle.trim(),
        level,
        synonymTitles: [...allSynonyms],
        industryResults: allResults,
      });
    }

    setLoading(false);
    setLoadingMsg("");
    setProgress({ current: 0, total: 0, industry: "" });
  };

  const reset = () => {
    setResults(null);
    setJobTitle("");
    setIndustries([{ value: "", other: "" }]);
    setLevel("");
    setError("");
  };

  const totalCompanies = results
    ? results.industryResults.reduce((sum, r) => sum + (r.companies?.length || 0), 0)
    : 0;

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: "100vh", background: C.cream, color: C.darkBrown }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sacramento&family=DM+Sans:wght@300;400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .hdr { background: ${C.headerBg}; padding: 22px 36px; display: flex; align-items: center; gap: 14px; }
        .hdr-dot { width: 38px; height: 38px; background: ${C.accent}; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .hdr-title { color: ${C.cream}; font-family: 'Sacramento', cursive; font-size: 28px; line-height: 1.1; }
        .hdr-sub { color: rgba(249,240,232,0.6); font-size: 11px; letter-spacing: 1.8px; text-transform: uppercase; margin-top: 3px; }
        .main { max-width: 780px; margin: 0 auto; padding: 44px 24px; }
        .intro { margin-bottom: 36px; }
        .intro h2 { font-size: 28px; font-weight: 700; color: ${C.darkBrown}; line-height: 1.3; margin-bottom: 10px; }
        .intro p { font-size: 15px; color: ${C.medBrown}; line-height: 1.75; font-weight: 300; }
        .card { background: #fff; border: 1px solid ${C.blush}; border-radius: 14px; padding: 28px; margin-bottom: 16px; }
        .lbl { font-size: 11px; font-weight: 500; letter-spacing: 1.8px; text-transform: uppercase; color: ${C.medBrown}; margin-bottom: 10px; display: block; }
        .text-input, select, .other-input { width: 100%; padding: 13px 16px; border: 1px solid ${C.blush}; border-radius: 8px; font-size: 14px; font-family: 'DM Sans', sans-serif; color: ${C.darkBrown}; transition: border-color .2s; background: ${C.cream}; }
        .text-input::placeholder { color: ${C.blush}; }
        select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2398543C' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 16px center; cursor: pointer; }
        .text-input:focus, select:focus, .other-input:focus { outline: none; border-color: ${C.accent}; }
        .other-input { margin-top: 10px; }
        .other-input::placeholder { color: ${C.blush}; }
        .ind-row { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 10px; }
        .ind-row:last-child { margin-bottom: 0; }
        .ind-row select { flex: 1; }
        .ind-remove { width: 38px; height: 46px; flex-shrink: 0; border: 1px solid ${C.blush}; border-radius: 8px; background: ${C.cream}; color: ${C.medBrown}; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .2s; }
        .ind-remove:hover { border-color: ${C.rust}; color: ${C.rust}; background: #FEF0EE; }
        .add-ind-btn { display: inline-flex; align-items: center; gap: 6px; background: none; border: none; color: ${C.forest}; font-size: 13px; font-weight: 500; cursor: pointer; padding: 8px 0 0; font-family: 'DM Sans', sans-serif; transition: color .2s; }
        .add-ind-btn:hover { color: ${C.accent}; }
        .add-ind-btn:disabled { color: ${C.blush}; cursor: not-allowed; }
        .btn { width: 100%; padding: 17px; background: ${C.headerBg}; color: ${C.cream}; border: none; border-radius: 10px; font-size: 15px; font-weight: 500; cursor: pointer; transition: all .2s; margin-top: 6px; font-family: 'DM Sans', sans-serif; }
        .btn:hover:not(:disabled) { background: ${C.medBrown}; }
        .btn:disabled { opacity: .4; cursor: not-allowed; }
        .err { background: #FEF0EE; border: 1px solid ${C.accent}; border-radius: 8px; padding: 13px 18px; color: ${C.rust}; font-size: 13px; margin-bottom: 18px; }
        .loading-state { text-align: center; padding: 64px 20px; }
        .spinner { width: 44px; height: 44px; border: 2px solid ${C.blush}; border-top-color: ${C.accent}; border-radius: 50%; animation: spin .9s linear infinite; margin: 0 auto 22px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .loading-msg { font-size: 16px; color: ${C.medBrown}; font-weight: 300; }
        .loading-hint { font-size: 12px; color: ${C.blush}; margin-top: 8px; }
        .loading-progress { font-size: 13px; color: ${C.forest}; font-weight: 500; margin-bottom: 14px; }
        .progress-bar-wrap { width: 200px; height: 4px; background: ${C.blush}; border-radius: 4px; margin: 0 auto 20px; overflow: hidden; }
        .progress-bar-fill { height: 100%; background: ${C.accent}; border-radius: 4px; transition: width .5s ease; }
        .results-header { margin-bottom: 28px; }
        .results-header h2 { font-size: 26px; font-weight: 700; color: ${C.darkBrown}; margin-bottom: 6px; }
        .results-meta { font-size: 14px; color: ${C.medBrown}; font-weight: 300; }
        .results-meta strong { color: ${C.forest}; font-weight: 500; }
        .synonyms-section { background: #FFF3EE; border: 1px solid ${C.accent}; border-radius: 12px; padding: 20px 24px; margin-bottom: 28px; }
        .synonyms-title { font-size: 11px; font-weight: 500; letter-spacing: 1.8px; text-transform: uppercase; color: ${C.rust}; margin-bottom: 12px; }
        .synonyms-row { display: flex; flex-wrap: wrap; gap: 8px; }
        .synonym-tag { background: #fff; border: 1px solid ${C.accent}; color: ${C.darkBrown}; font-size: 13px; font-weight: 500; padding: 6px 14px; border-radius: 20px; }
        .industry-section { margin-bottom: 36px; }
        .industry-header { background: ${C.headerBg}; color: ${C.cream}; padding: 16px 22px; border-radius: 12px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; }
        .industry-header h3 { font-size: 18px; font-weight: 700; margin: 0; }
        .industry-count { font-size: 12px; color: ${C.accent}; font-weight: 500; letter-spacing: 1px; text-transform: uppercase; }
        .industry-error { background: #FEF0EE; border: 1px solid ${C.accent}; border-radius: 10px; padding: 16px 20px; color: ${C.rust}; font-size: 13px; text-align: center; }
        .divider { height: 1px; background: ${C.blush}; margin: 24px 0; opacity: .5; }
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
          <div className="hdr-sub">Find Your Fulfilling Career &middot; FYFC Tool</div>
        </div>
      </div>

      <div className="main">
        {!loading && !results && (
          <>
            <div className="intro">
              <h2>Find companies actively hiring for roles that fit you.</h2>
              <p>Enter your target job title, choose up to 3 industries, and this tool will search company career pages — not job boards — to find organizations with active openings that match your background.</p>
            </div>

            {error && <div className="err">{error}</div>}

            {/* Job Title */}
            <div className="card">
              <span className="lbl">Job title</span>
              <input
                className="text-input"
                type="text"
                placeholder="e.g. Program Manager"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
              />
            </div>

            {/* Industries (1-3) */}
            <div className="card">
              <span className="lbl">Target {industries.length > 1 ? "industries" : "industry"}</span>
              {industries.map((ind, idx) => (
                <div key={idx}>
                  <div className="ind-row">
                    <select
                      value={ind.value}
                      onChange={(e) => updateIndustry(idx, "value", e.target.value)}
                    >
                      <option value="">Select an industry...</option>
                      {INDUSTRIES.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                    {industries.length > 1 && (
                      <button className="ind-remove" onClick={() => removeIndustry(idx)} title="Remove">
                        &times;
                      </button>
                    )}
                  </div>
                  {ind.value === "Other" && (
                    <input
                      className="other-input"
                      type="text"
                      placeholder="Type your industry here..."
                      value={ind.other}
                      onChange={(e) => updateIndustry(idx, "other", e.target.value)}
                      style={{ marginBottom: 10 }}
                    />
                  )}
                </div>
              ))}
              {industries.length < 3 && (
                <button className="add-ind-btn" onClick={addIndustry}>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>+</span> Add another industry
                </button>
              )}
            </div>

            {/* Seniority Level */}
            <div className="card">
              <span className="lbl">Seniority level</span>
              <select value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="">Select a level...</option>
                {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            <button className="btn" onClick={handleSearch} disabled={!canSearch()}>
              {getEffectiveIndustries().length > 1
                ? `Find companies across ${getEffectiveIndustries().length} industries →`
                : "Find my 10 companies →"}
            </button>
          </>
        )}

        {loading && (
          <div className="loading-state">
            <div className="spinner" />
            {progress.total > 1 && (
              <>
                <div className="loading-progress">
                  Searching industry {progress.current} of {progress.total}: {progress.industry}
                </div>
                <div className="progress-bar-wrap">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </>
            )}
            <div className="loading-msg">{loadingMsg}</div>
            <div className="loading-hint">
              Searching company career pages — this takes about {progress.total > 1 ? "30–60 seconds per industry" : "30–60 seconds"}.
            </div>
          </div>
        )}

        {results && !loading && (
          <>
            <div className="results-header">
              <h2>Your target companies</h2>
              <p className="results-meta">
                Job title: <strong>{results.jobTitle}</strong>&nbsp;&middot;&nbsp;
                Level: <strong>{results.level}</strong>&nbsp;&middot;&nbsp;
                <strong>{totalCompanies}</strong> companies found
              </p>
            </div>

            {/* Synonym Titles */}
            {results.synonymTitles?.length > 0 && (
              <div className="synonyms-section">
                <div className="synonyms-title">Synonym titles found</div>
                <div className="synonyms-row">
                  {results.synonymTitles.map((t, i) => (
                    <span key={i} className="synonym-tag">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Industry-grouped results */}
            {results.industryResults.map((ir, idx) => (
              <div key={idx} className="industry-section">
                <div className="industry-header">
                  <h3>{ir.industry}</h3>
                  <span className="industry-count">
                    {ir.error ? "Search failed" : `${ir.companies?.length || 0} companies`}
                  </span>
                </div>

                {ir.error ? (
                  <div className="industry-error">
                    Could not complete the search for this industry. Try searching again.
                  </div>
                ) : (
                  ir.companies?.map((c, i) => (
                    <div key={i} className="co-card">
                      <div className="co-num">Company {String(i + 1).padStart(2, "0")}</div>
                      <div className="co-name">{c.name}</div>
                      <div className="roles-row">
                        {c.roles?.map((r, j) => <span key={j} className="role-pill">{r}</span>)}
                      </div>
                      <div className="co-why">{c.whyItFits}</div>
                      {c.hiringSignal && (
                        <div className="co-signal"><strong>Hiring signal:</strong> {c.hiringSignal}</div>
                      )}
                      {c.careersUrl && (
                        <a href={c.careersUrl} target="_blank" rel="noopener noreferrer" className="co-link">
                          View careers page
                          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 11L11 1M11 1H4M11 1v7"/>
                          </svg>
                        </a>
                      )}
                    </div>
                  ))
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
