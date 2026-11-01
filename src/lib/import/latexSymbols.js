// Bảng đổi ký hiệu Unicode → lệnh LaTeX (dùng chung cho Word OMML, MathType, PDF)
export const SYMBOLS = {
  π: '\\pi', α: '\\alpha', β: '\\beta', γ: '\\gamma', δ: '\\delta', ε: '\\varepsilon', ϵ: '\\epsilon', ζ: '\\zeta', η: '\\eta',
  θ: '\\theta', ϑ: '\\vartheta', ι: '\\iota', κ: '\\kappa', λ: '\\lambda', μ: '\\mu', ν: '\\nu', ξ: '\\xi', ρ: '\\rho', σ: '\\sigma',
  τ: '\\tau', υ: '\\upsilon', φ: '\\varphi', ϕ: '\\phi', χ: '\\chi', ψ: '\\psi', ω: '\\omega',
  Γ: '\\Gamma', Δ: '\\Delta', '∆': '\\Delta', Θ: '\\Theta', Λ: '\\Lambda', Ξ: '\\Xi', Π: '\\Pi', Σ: '\\Sigma', Φ: '\\Phi', Ψ: '\\Psi', Ω: '\\Omega',
  '±': '\\pm', '∓': '\\mp', '×': '\\times', '÷': '\\div', '·': '\\cdot', '⋅': '\\cdot', '∘': '\\circ', '°': '^{\\circ}', '∗': '*',
  '≤': '\\le', '⩽': '\\le', '≥': '\\ge', '⩾': '\\ge', '≠': '\\ne', '≈': '\\approx', '≡': '\\equiv', '∼': '\\sim', '≅': '\\cong', '∝': '\\propto',
  '∈': '\\in', '∉': '\\notin', '∋': '\\ni', '⊂': '\\subset', '⊃': '\\supset', '⊆': '\\subseteq', '⊇': '\\supseteq', '⊄': '\\not\\subset',
  '∪': '\\cup', '∩': '\\cap', '∅': '\\emptyset', '∖': '\\setminus', '∞': '\\infty', '∂': '\\partial', '∇': '\\nabla',
  '∀': '\\forall', '∃': '\\exists', '¬': '\\neg', '∧': '\\wedge', '∨': '\\vee',
  '→': '\\to', '←': '\\leftarrow', '↔': '\\leftrightarrow', '⇒': '\\Rightarrow', '⇐': '\\Leftarrow', '⇔': '\\Leftrightarrow', '↦': '\\mapsto',
  '↑': '\\uparrow', '↓': '\\downarrow',
  '…': '\\ldots', '⋯': '\\cdots', '⋮': '\\vdots', '⋱': '\\ddots',
  '∥': '\\parallel', '⊥': '\\perp', '∠': '\\angle', '△': '\\triangle', '∣': '\\mid',
  ℝ: '\\mathbb{R}', ℕ: '\\mathbb{N}', ℤ: '\\mathbb{Z}', ℚ: '\\mathbb{Q}', ℂ: '\\mathbb{C}',
  '∫': '\\int', '∑': '\\sum', '∏': '\\prod', '\\': '\\setminus', '“': '"', '”': '"', '‘': "'", '’': "'",
  '−': '-', '–': '-', '′': "'", '″': "''", ' ': ' ', ' ': ' ', '​': '', '⁡': '', '⁢': '', '⁣': ',',
  '{': '\\{', '}': '\\}', '%': '\\%', '#': '\\#',
};

export const FUNCTION_NAMES = ['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'lg', 'exp', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'gcd', 'deg', 'arg', 'ker', 'dim'];

// Chữ cái toán học kiểu nghiêng/đậm (𝑥, 𝐀…) → chữ thường
function normalizeMathAlnum(ch) {
  const cp = ch.codePointAt(0);
  if (cp >= 0x1d400 && cp <= 0x1d7ff) return ch.normalize('NFKC');
  return ch;
}

export function mapSymbols(text) {
  let out = '';
  for (const raw of Array.from(text)) {
    const ch = normalizeMathAlnum(raw);
    const m = SYMBOLS[ch];
    if (m === undefined) out += ch;
    else out += /\\[a-zA-Z]+$/.test(m) ? `${m} ` : m;
  }
  return out.normalize('NFC');
}
