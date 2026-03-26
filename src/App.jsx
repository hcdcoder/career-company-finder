import { useState, useEffect, useCallback } from "react";

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

const SEARCH_LIMIT = 3;
const LIMIT_KEY = "ccf_search_usage";

/* ── Search limit helpers (localStorage, 3 per 24h) ── */
function getSearchUsage() {
  try {
    const raw = localStorage.getItem(LIMIT_KEY);
    if (!raw) return { count: 0, resetAt: 0 };
    const data = JSON.parse(raw);
    if (Date.now() >= data.resetAt) return { count: 0, resetAt: 0 };
    return data;
  } catch { return { count: 0, resetAt: 0 }; }
}

function recordSearch() {
  const usage = getSearchUsage();
  const newCount = usage.count + 1;
  const resetAt = usage.resetAt > Date.now() ? usage.resetAt : Date.now() + 24 * 60 * 60 * 1000;
  localStorage.setItem(LIMIT_KEY, JSON.stringify({ count: newCount, resetAt }));
  return newCount;
}

function remainingSearches() {
  return Math.max(0, SEARCH_LIMIT - getSearchUsage().count);
}

/* ── System prompt builder ── */
function buildSystemPrompt(jobTitle, industry, level) {
  return `You are a job search strategist inside a career coaching program called Find Your Fulfilling Career (FYFC), created by Dr. Tega Edwin (Her Career Doctor).

Your job is to find 10 real companies that are actively hiring on their own career pages — NOT from job boards like Indeed, LinkedIn, or Glassdoor — for roles matching the job title "${jobTitle}" (or equivalent/synonym titles) in the ${industry} industry at the ${level} seniority level.

CRITICAL EVIDENCE REQUIREMENT:
- ONLY include a company if you found DIRECT EVIDENCE of an active, current job posting on that company's own careers page for "${jobTitle}" or a closely related synonym title.
- Do NOT include companies that are merely "known to hire" for this type of role or that "typically have openings" — you must have found a specific, currently-listed job posting.
- If you cannot find 10 companies with verified active postings, return fewer rather than padding with unverified companies.

INSTRUCTIONS:
1. First, identify 3-6 synonym or equivalent job titles for "${jobTitle}" in the ${industry} industry. Think about what different companies might call this same type of role.
2. Use web search to find companies in the ${industry} industry that have active openings on their company career pages matching "${jobTitle}" or any of the synonym titles you identified.
3. Focus on companies that post jobs on their own careers site (e.g. company.com/careers), not aggregators.
4. For each company, record the SPECIFIC job title you found evidence of in the "searchTitle" field. This is the exact title the user should search for on that company's careers page.
5. Return up to 10 companies.

RESPOND ONLY WITH A VALID JSON OBJECT — no preamble, no markdown, no backticks. Follow this exact structure:
{
  "synonymTitles": ["synonym1", "synonym2", "synonym3"],
  "companies": [
    {
      "name": "Company Name",
      "careersUrl": "https://company.com/careers",
      "roles": ["Role Title 1", "Role Title 2"],
      "searchTitle": "The specific job title found on this company's career page",
      "whyItFits": "One sentence explaining why this company is a strong match.",
      "hiringSignal": "Brief note on what direct evidence you found of this active posting."
    }
  ]
}`;
}

/* ── Robust JSON extraction ── */
function extractJSON(raw) {
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object") return parsed;
  } catch (_) {}

  const start = cleaned.indexOf("{");
  if (start !== -1) {
    let depth = 0, inString = false, escaped = false, end = -1;
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") depth++;
      if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end !== -1) {
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (_) {}
    }
    const greedyMatch = cleaned.match(/\{[\s\S]*\}/);
    if (greedyMatch) {
      try { return JSON.parse(greedyMatch[0]); } catch (_) {}
    }
    const repaired = repairTruncatedJSON(cleaned.slice(start));
    if (repaired) {
      try { return JSON.parse(repaired); } catch (_) {}
    }
  }
  return null;
}

function repairTruncatedJSON(str) {
  let s = str.replace(/,\s*"[^"]*$/, "").replace(/,\s*$/, "");
  let inString = false, escaped = false;
  const stack = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    if (ch === "}") { if (stack.length && stack[stack.length - 1] === "{") stack.pop(); }
    if (ch === "]") { if (stack.length && stack[stack.length - 1] === "[") stack.pop(); }
  }
  if (inString) s += '"';
  while (stack.length) {
    const open = stack.pop();
    s += open === "{" ? "}" : "]";
  }
  return s;
}

/* ── Download helpers ── */
function downloadCSV(results) {
  const rows = [["Industry", "Company Number", "Company Name", "Roles", "Search Title", "Why It Fits", "Hiring Signal", "Careers URL"]];
  results.industryResults.forEach((ir) => {
    (ir.companies || []).forEach((c, i) => {
      rows.push([
        ir.industry,
        String(i + 1),
        c.name || "",
        (c.roles || []).join("; "),
        c.searchTitle || "",
        c.whyItFits || "",
        c.hiringSignal || "",
        c.careersUrl || "",
      ]);
    });
  });
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Career-Company-Finder-Results.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function downloadPDF(results) {
  const lines = [];
  const add = (text) => lines.push(text);
  const gap = () => lines.push("");

  add("CAREER COMPANY FINDER RESULTS");
  add("=".repeat(50));
  add(`Job Title: ${results.jobTitle}`);
  add(`Seniority Level: ${results.level}`);
  const total = results.industryResults.reduce((s, r) => s + (r.companies?.length || 0), 0);
  add(`Total Companies Found: ${total}`);
  gap();

  if (results.synonymTitles?.length) {
    add("SYNONYM TITLES FOUND");
    add("-".repeat(30));
    add(results.synonymTitles.join(", "));
    gap();
  }

  results.industryResults.forEach((ir) => {
    add(`${"=".repeat(50)}`);
    add(`INDUSTRY: ${ir.industry.toUpperCase()}`);
    add(`Companies: ${ir.companies?.length || 0}`);
    add("=".repeat(50));
    gap();

    (ir.companies || []).forEach((c, i) => {
      add(`${String(i + 1).padStart(2, "0")}. ${c.name}`);
      if (c.roles?.length) add(`    Roles: ${c.roles.join(", ")}`);
      if (c.searchTitle) add(`    Search for: "${c.searchTitle}"`);
      if (c.whyItFits) add(`    Why it fits: ${c.whyItFits}`);
      if (c.hiringSignal) add(`    Hiring signal: ${c.hiringSignal}`);
      if (c.careersUrl) add(`    Careers page: ${c.careersUrl}`);
      gap();
    });
  });

  add("-".repeat(50));
  add("Generated by Career Company Finder — FYFC Tool");
  add("Created by Dr. Tega Edwin (Her Career Doctor)");

  const text = lines.join("\n");

  // Build a simple PDF manually (no library needed)
  const pdfLines = text.split("\n");
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 50;
  const lineHeight = 14;
  const maxLineWidth = pageWidth - margin * 2;
  const charWidth = 6; // approximate for Courier 10pt
  const maxCharsPerLine = Math.floor(maxLineWidth / charWidth);

  // Word-wrap long lines
  const wrappedLines = [];
  pdfLines.forEach((line) => {
    if (line.length <= maxCharsPerLine) {
      wrappedLines.push(line);
    } else {
      let remaining = line;
      while (remaining.length > maxCharsPerLine) {
        let breakIdx = remaining.lastIndexOf(" ", maxCharsPerLine);
        if (breakIdx <= 0) breakIdx = maxCharsPerLine;
        wrappedLines.push(remaining.slice(0, breakIdx));
        remaining = remaining.slice(breakIdx).trimStart();
      }
      if (remaining) wrappedLines.push(remaining);
    }
  });

  // Paginate
  const usableHeight = pageHeight - margin * 2;
  const linesPerPage = Math.floor(usableHeight / lineHeight);
  const pages = [];
  for (let i = 0; i < wrappedLines.length; i += linesPerPage) {
    pages.push(wrappedLines.slice(i, i + linesPerPage));
  }

  // PDF object builder
  const objects = [];
  let objNum = 0;
  const addObj = (content) => { objNum++; objects.push({ num: objNum, content }); return objNum; };

  // 1: Catalog
  const catalogNum = addObj(""); // placeholder
  // 2: Pages
  const pagesNum = addObj(""); // placeholder
  // 3: Font
  const fontNum = addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");

  // Page objects
  const pageObjNums = [];
  const streamObjNums = [];
  pages.forEach((pageLines) => {
    // Stream content
    let stream = "BT\n/F1 10 Tf\n";
    stream += `${margin} ${pageHeight - margin} Td\n`;
    stream += `${lineHeight} TL\n`;
    pageLines.forEach((line) => {
      const escaped = line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
      stream += `(${escaped}) '\n`;
    });
    stream += "ET";
    const streamNum = addObj(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    streamObjNums.push(streamNum);
    const pageNum = addObj(""); // placeholder
    pageObjNums.push(pageNum);
  });

  // Now fill in placeholders
  objects[catalogNum - 1].content = `<< /Type /Catalog /Pages ${pagesNum} 0 R >>`;
  const kidRefs = pageObjNums.map((n) => `${n} 0 R`).join(" ");
  objects[pagesNum - 1].content = `<< /Type /Pages /Kids [${kidRefs}] /Count ${pages.length} >>`;
  pageObjNums.forEach((pNum, idx) => {
    objects[pNum - 1].content = `<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${streamObjNums[idx]} 0 R /Resources << /Font << /F1 ${fontNum} 0 R >> >> >>`;
  });

  // Build PDF bytes
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((obj) => {
    offsets.push(pdf.length);
    pdf += `${obj.num} 0 obj\n${obj.content}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.forEach((off) => {
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogNum} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Career-Company-Finder-Results.pdf";
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Main Component ── */
export default function CareerCompanyFinder() {
  const [jobTitle,    setJobTitle]    = useState("");
  const [industries,  setIndustries]  = useState([{ value: "", other: "" }]);
  const [level,       setLevel]       = useState("");
  const [loading,     setLoading]     = useState(false);
  const [results,     setResults]     = useState(null);
  const [error,       setError]       = useState("");
  const [loadingMsg,  setLoadingMsg]  = useState("");
  const [progress,    setProgress]    = useState({ current: 0, total: 0, industry: "" });
  const [searches,    setSearches]    = useState(remainingSearches);

  // Refresh search count on mount and periodically
  useEffect(() => {
    const check = () => setSearches(remainingSearches());
    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, []);

  const limitReached = searches <= 0;

  const loadingMessages = [
    "Identifying synonym job titles...",
    "Searching career pages in your target industry...",
    "Filtering for active hiring signals...",
    "Matching roles to your job title...",
    "Almost there — building your company list...",
  ];

  const addIndustry = () => {
    if (industries.length < 3) setIndustries([...industries, { value: "", other: "" }]);
  };
  const removeIndustry = (idx) => setIndustries(industries.filter((_, i) => i !== idx));
  const updateIndustry = (idx, field, val) => {
    const updated = [...industries];
    updated[idx] = { ...updated[idx], [field]: val };
    if (field === "value") updated[idx].other = "";
    setIndustries(updated);
  };
  const getEffectiveIndustries = useCallback(() =>
    industries.map((ind) => (ind.value === "Other" ? ind.other.trim() : ind.value)).filter(Boolean),
    [industries]
  );
  const canSearch = () => jobTitle.trim() && getEffectiveIndustries().length > 0 && level && !limitReached;

  const handleSearch = async () => {
    if (limitReached) {
      setError("You've reached your daily limit — check back tomorrow.");
      return;
    }
    const effectiveIndustries = getEffectiveIndustries();
    if (!jobTitle.trim() || effectiveIndustries.length === 0 || !level) {
      setError("Please enter a job title, select at least one industry, and choose a level.");
      return;
    }
    setError("");
    setResults(null);
    setLoading(true);

    // Record this search against the daily limit
    recordSearch();
    setSearches(remainingSearches());

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
              content: `Find 10 companies in the ${industry} industry that are actively hiring on their career pages for "${jobTitle.trim()}" or equivalent roles at the ${level} level. Only include companies where you found direct evidence of a current job posting. Include the searchTitle field for each company. Return the JSON now.`,
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
        const allText = textBlocks.map((b) => b.text).join("\n");
        if (!allText.trim()) throw new Error("No response received.");

        const parsed = extractJSON(allText);
        if (!parsed) throw new Error("Could not parse company results from response.");

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
    setSearches(remainingSearches());
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
        .limit-banner { background: #FEF0EE; border: 1px solid ${C.rust}; border-radius: 10px; padding: 18px 22px; text-align: center; margin-bottom: 18px; }
        .limit-banner p { font-size: 15px; color: ${C.rust}; font-weight: 500; }
        .searches-left { font-size: 12px; color: ${C.medBrown}; text-align: center; margin-top: 10px; }
        .loading-state { text-align: center; padding: 64px 20px; }
        .spinner { width: 44px; height: 44px; border: 2px solid ${C.blush}; border-top-color: ${C.accent}; border-radius: 50%; animation: spin .9s linear infinite; margin: 0 auto 22px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .loading-msg { font-size: 16px; color: ${C.medBrown}; font-weight: 300; }
        .loading-hint { font-size: 12px; color: ${C.blush}; margin-top: 8px; }
        .loading-progress { font-size: 13px; color: ${C.forest}; font-weight: 500; margin-bottom: 14px; }
        .progress-bar-wrap { width: 200px; height: 4px; background: ${C.blush}; border-radius: 4px; margin: 0 auto 20px; overflow: hidden; }
        .progress-bar-fill { height: 100%; background: ${C.accent}; border-radius: 4px; transition: width .5s ease; }
        .results-header { margin-bottom: 10px; }
        .results-header h2 { font-size: 26px; font-weight: 700; color: ${C.darkBrown}; margin-bottom: 6px; }
        .results-meta { font-size: 14px; color: ${C.medBrown}; font-weight: 300; }
        .results-meta strong { color: ${C.forest}; font-weight: 500; }
        .disclaimer { background: ${C.cream}; border: 1px solid ${C.blush}; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; display: flex; align-items: flex-start; gap: 10px; }
        .disclaimer-icon { flex-shrink: 0; margin-top: 1px; color: ${C.medBrown}; }
        .disclaimer p { font-size: 12px; color: ${C.medBrown}; line-height: 1.55; font-style: italic; }
        .action-banner { background: ${C.forest}; color: #fff; border-radius: 10px; padding: 16px 22px; margin-bottom: 22px; }
        .action-banner p { font-size: 14px; line-height: 1.6; font-weight: 300; }
        .synonyms-section { background: #FFF3EE; border: 1px solid ${C.accent}; border-radius: 12px; padding: 20px 24px; margin-bottom: 28px; }
        .synonyms-title { font-size: 11px; font-weight: 500; letter-spacing: 1.8px; text-transform: uppercase; color: ${C.rust}; margin-bottom: 12px; }
        .synonyms-row { display: flex; flex-wrap: wrap; gap: 8px; }
        .synonym-tag { background: #fff; border: 1px solid ${C.accent}; color: ${C.darkBrown}; font-size: 13px; font-weight: 500; padding: 6px 14px; border-radius: 20px; }
        .industry-section { margin-bottom: 36px; }
        .industry-header { background: ${C.headerBg}; color: ${C.cream}; padding: 16px 22px; border-radius: 12px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; }
        .industry-header h3 { font-size: 18px; font-weight: 700; margin: 0; }
        .industry-count { font-size: 12px; color: ${C.accent}; font-weight: 500; letter-spacing: 1px; text-transform: uppercase; }
        .industry-error { background: #FEF0EE; border: 1px solid ${C.accent}; border-radius: 10px; padding: 16px 20px; color: ${C.rust}; font-size: 13px; text-align: center; }
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
        .search-instruction { background: ${C.cream}; border: 1px solid ${C.sage}; border-radius: 8px; padding: 10px 14px; margin-top: 12px; display: flex; align-items: center; gap: 8px; }
        .search-instruction .si-icon { flex-shrink: 0; color: ${C.forest}; }
        .search-instruction p { font-size: 13px; color: ${C.darkBrown}; }
        .search-instruction strong { color: ${C.forest}; font-weight: 700; }
        .download-row { display: flex; gap: 12px; margin-top: 24px; margin-bottom: 10px; }
        .dl-btn { flex: 1; padding: 14px; border-radius: 10px; font-size: 14px; font-weight: 500; cursor: pointer; font-family: 'DM Sans', sans-serif; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all .2s; }
        .dl-pdf { background: ${C.headerBg}; color: ${C.cream}; border: none; }
        .dl-pdf:hover { background: ${C.medBrown}; }
        .dl-csv { background: #fff; color: ${C.darkBrown}; border: 1px solid ${C.blush}; }
        .dl-csv:hover { border-color: ${C.darkBrown}; }
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
              <p style={{ fontSize: 12, color: C.blush, marginTop: 12, fontWeight: 400 }}>Please note: this tool is limited to 3 searches per 24 hours.</p>
            </div>

            {error && <div className="err">{error}</div>}

            {limitReached && (
              <div className="limit-banner">
                <p>You've reached your daily limit — check back tomorrow.</p>
              </div>
            )}

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

            {!limitReached && (
              <>
                <button className="btn" onClick={handleSearch} disabled={!canSearch()}>
                  {getEffectiveIndustries().length > 1
                    ? `Find companies across ${getEffectiveIndustries().length} industries →`
                    : "Find my 10 companies →"}
                </button>
                {searches < SEARCH_LIMIT && (
                  <div className="searches-left">
                    {searches} search{searches !== 1 ? "es" : ""} remaining today
                  </div>
                )}
              </>
            )}
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

            {/* Disclaimer */}
            <div className="disclaimer">
              <svg className="disclaimer-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
              </svg>
              <p>Listings are based on live web searches. Verify each role directly on the careers page as positions may close quickly.</p>
            </div>

            {/* Action banner */}
            <div className="action-banner">
              <p>These companies are actively hiring right now. Each card below tells you exactly what to search for on that company's careers page.</p>
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
                      {c.searchTitle && (
                        <div className="search-instruction">
                          <svg className="si-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                          </svg>
                          <p>Search &lsquo;<strong>{c.searchTitle}</strong>&rsquo; on this page</p>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            ))}

            {/* Download buttons */}
            <div className="download-row">
              <button className="dl-btn dl-pdf" onClick={() => downloadPDF(results)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                </svg>
                Download PDF
              </button>
              <button className="dl-btn dl-csv" onClick={() => downloadCSV(results)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                </svg>
                Download CSV
              </button>
            </div>

            <button className="reset-btn" onClick={reset}>Start a new search</button>
          </>
        )}
      </div>
    </div>
  );
}
