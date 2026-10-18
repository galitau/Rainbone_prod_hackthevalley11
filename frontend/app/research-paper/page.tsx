import Link from "next/link";
import type { ReactNode } from "react";
import { pageMetadata } from "@/lib/seo";
import { PrintButton } from "./print-button";
import { Dashboard } from "@/components/dashboard";

export const metadata = pageMetadata("/research-paper");

// Display equations in order of appearance; the number shown is the position in this list.
// Each MathML string was compiled from the TeX in the comment above it (Temml 0.11.10, MathML Core).
const EQ_ORDER: readonly string[] = ["tetVolume","voxelMask","coarsen","voxelNodes","strongForm","strain","hooke","voigt","weakForm","discrete","femurRegions","traction","equilibrium","elementStress","vonMises","nodalAvg","stressRatio","huDensity","huModulus","blockModulus","boneStress","percentile","apiIndex","boneVolume","uploadBands","pressBc","degraded","cstStrain","nonlocal","failureRatio","history","damageLaw","fixture","onset","staggered","pressLoad","volFractions","ranks","quartile","factorRisk","templateRule","grounded","fallbackG","askDigest","allowedSet","explainNum","acceptE","kindPools","perNumber","timeOk","rankDir","acceptR","cooldown","keyFailover","lifetime","delta","criticRoute","planValid","acceptA","render","required","admission","auditRow","auditCheck","tokens","bar","seriesBar","dice","verdict"];

const EQ = {
  // V_e=\tfrac16\,\det\bigl[\,\mathbf{x}_1-\mathbf{x}_0,\ \mathbf{x}_2-\mathbf{x}_0,\ \mathbf{x}_3-\mathbf{x}_0\,\bigr]>0
  tetVolume: "<mrow><msub><mi>V</mi><mi>e</mi></msub><mo>=</mo><mstyle displaystyle=\"false\" scriptlevel=\"0\"><mfrac><mn>1</mn><mn>6</mn></mfrac></mstyle><mspace width=\"0.1667em\"></mspace><mrow><mspace width=\"0.1667em\"></mspace><mi>det</mi><mo>⁡</mo></mrow><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">[</mo><mspace width=\"0.1667em\"></mspace><msub><mi>𝐱</mi><mn>1</mn></msub><mo>−</mo><msub><mi>𝐱</mi><mn>0</mn></msub><mo separator=\"true\">,</mo><mtext> </mtext><msub><mi>𝐱</mi><mn>2</mn></msub><mo>−</mo><msub><mi>𝐱</mi><mn>0</mn></msub><mo separator=\"true\">,</mo><mtext> </mtext><msub><mi>𝐱</mi><mn>3</mn></msub><mo>−</mo><msub><mi>𝐱</mi><mn>0</mn></msub><mspace width=\"0.1667em\"></mspace><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">]</mo><mo>&gt;</mo><mn>0</mn></mrow>",
  // M=\operatorname{LCC}_6\bigl(\{\,\mathbf{v}\ :\ \mathrm{HU}(\mathbf{v})\ge 150\,\}\bigr)
  voxelMask: "<mrow><mi>M</mi><mo>=</mo><msub><mi>LCC</mi><mn>6</mn></msub><mo>⁡</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">(</mo><mo form=\"prefix\" stretchy=\"false\">{</mo><mspace width=\"0.1667em\"></mspace><mi>𝐯</mi><mtext> </mtext><mo lspace=\"0.2222em\" rspace=\"0.2222em\">:</mo><mtext> </mtext><mpadded lspace=\"0\"><mi>HU</mi></mpadded><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>𝐯</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>≥</mo><mn>150</mn><mspace width=\"0.1667em\"></mspace><mo form=\"postfix\" stretchy=\"false\">}</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">)</mo></mrow>",
  // \begin{gathered} h^{(0)}=\left(\frac{N_b\,\Delta_x\Delta_y\Delta_z}{8000}\right)^{1/3},\qquad f_i=\max\!\left(1,\ \operatorname{round}\frac{h}{\Delta_i}\right)\quad(i=x,y,z),\\ h\leftarrow 1.1\,h\quad\text{until}\quad N_{\text{blocks}}(f_x,f_y,f_z)\le 8000, \end{gathered}
  coarsen: "<mtable displaystyle=\"true\" class=\"tml-jot\"><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><msup><mi>h</mi><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">(</mo><mn>0</mn><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msup><mo>=</mo><msup><mrow><mo fence=\"true\" form=\"prefix\">(</mo><mfrac><mrow><msub><mi>N</mi><mi>b</mi></msub><mspace width=\"0.1667em\"></mspace><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Δ</mi></mpadded><mi>x</mi></msub><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Δ</mi></mpadded><mi>y</mi></msub><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Δ</mi></mpadded><mi>z</mi></msub></mrow><mn>8000</mn></mfrac><mo fence=\"true\" form=\"postfix\">)</mo></mrow><mrow><mn>1</mn><mi>/</mi><mn>3</mn></mrow></msup><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><msub><mi>f</mi><mi>i</mi></msub><mo>=</mo><mrow><mi>max</mi><mo>⁡</mo><mspace width=\"0.1667em\"></mspace></mrow><mrow style=\"margin-left:-0.1667em;\"></mrow><mrow><mo fence=\"true\" form=\"prefix\">(</mo><mn>1</mn><mo separator=\"true\">,</mo><mtext> </mtext><mi>round</mi><mo>⁡</mo><mspace width=\"0.1667em\"></mspace><mfrac><mi>h</mi><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Δ</mi></mpadded><mi>i</mi></msub></mfrac><mo fence=\"true\" form=\"postfix\">)</mo></mrow><mspace width=\"1em\"></mspace><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>i</mi><mo>=</mo><mi>x</mi><mo separator=\"true\">,</mo><mi>y</mi><mo separator=\"true\">,</mo><mi>z</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mi>h</mi><mo stretchy=\"false\">←</mo><mn>1.1</mn><mspace width=\"0.1667em\"></mspace><mi>h</mi><mspace width=\"1em\"></mspace><mtext>until</mtext><mspace width=\"1em\"></mspace><msub><mi>N</mi><mtext>blocks</mtext></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><msub><mi>f</mi><mi>x</mi></msub><mo separator=\"true\">,</mo><msub><mi>f</mi><mi>y</mi></msub><mo separator=\"true\">,</mo><msub><mi>f</mi><mi>z</mi></msub><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>≤</mo><mn>8000</mn><mo separator=\"true\">,</mo></mrow></mtd></mtr></mtable>",
  // \mathbf{x}=\operatorname{diag}\bigl(f_x\Delta_x,\ f_y\Delta_y,\ f_z\Delta_z\bigr)\,\bigl(\mathbf{g}-\tfrac12\mathbf{1}\bigr),
  voxelNodes: "<mrow><mi>𝐱</mi><mo>=</mo><mi>diag</mi><mo>⁡</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">(</mo><msub><mi>f</mi><mi>x</mi></msub><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Δ</mi></mpadded><mi>x</mi></msub><mo separator=\"true\">,</mo><mtext> </mtext><msub><mi>f</mi><mi>y</mi></msub><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Δ</mi></mpadded><mi>y</mi></msub><mo separator=\"true\">,</mo><mtext> </mtext><msub><mi>f</mi><mi>z</mi></msub><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Δ</mi></mpadded><mi>z</mi></msub><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">)</mo><mspace width=\"0.1667em\"></mspace><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">(</mo><mi>𝐠</mi><mo>−</mo><mstyle displaystyle=\"false\" scriptlevel=\"0\"><mfrac><mn>1</mn><mn>2</mn></mfrac></mstyle><mn>𝟏</mn><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">)</mo><mo separator=\"true\">,</mo></mrow>",
  // \begin{aligned} \nabla\cdot\boldsymbol{\sigma}(\mathbf{u})&=\mathbf{0}&&\text{in }\Omega\setminus\Omega_D,\\ \mathbf{u}&=\mathbf{0}&&\text{in }\Omega_D,\\ \boldsymbol{\sigma}\mathbf{n}&=\bar{\mathbf{t}}&&\text{on }\Gamma_N,\\ \boldsymbol{\sigma}\mathbf{n}&=\mathbf{0}&&\text{on }\partial\Omega\setminus(\bar\Omega_D\cup\Gamma_N), \end{aligned}
  strongForm: "<mtable displaystyle=\"true\" class=\"tml-jot\"><mtr><mtd class=\"tml-right\" style=\"padding-left:0em;padding-right:0em;\"><mrow><mo>∇</mo><mo form=\"prefix\" stretchy=\"false\">⋅</mo><mi>𝝈</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>𝐮</mi><mo form=\"postfix\" stretchy=\"false\">)</mo></mrow></mtd><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mrow><mo>=</mo><mn>𝟎</mn></mrow></mtd><mtd class=\"tml-right\" style=\"padding-left:1em;padding-right:0em;\"><mrow></mrow></mtd><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mrow><mtext>in </mtext><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Ω</mi></mpadded><mo>∖</mo><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Ω</mi></mpadded><mi>D</mi></msub><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd class=\"tml-right\" style=\"padding-left:0em;padding-right:0em;\"><mi>𝐮</mi></mtd><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mrow><mo>=</mo><mn>𝟎</mn></mrow></mtd><mtd class=\"tml-right\" style=\"padding-left:1em;padding-right:0em;\"><mrow></mrow></mtd><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mrow><mtext>in </mtext><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Ω</mi></mpadded><mi>D</mi></msub><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd class=\"tml-right\" style=\"padding-left:0em;padding-right:0em;\"><mrow><mi>𝝈</mi><mi>𝐧</mi></mrow></mtd><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mrow><mo>=</mo><mover><mi>𝐭</mi><mo stretchy=\"false\" style=\"math-depth:0;\">‾</mo></mover></mrow></mtd><mtd class=\"tml-right\" style=\"padding-left:1em;padding-right:0em;\"><mrow></mrow></mtd><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mrow><mtext>on </mtext><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Γ</mi></mpadded><mi>N</mi></msub><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd class=\"tml-right\" style=\"padding-left:0em;padding-right:0em;\"><mrow><mi>𝝈</mi><mi>𝐧</mi></mrow></mtd><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mrow><mo>=</mo><mn>𝟎</mn></mrow></mtd><mtd class=\"tml-right\" style=\"padding-left:1em;padding-right:0em;\"><mrow></mrow></mtd><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mrow><mtext>on </mtext><mi>∂</mi><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Ω</mi></mpadded><mo>∖</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><msub><mover><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Ω</mi></mpadded><mo stretchy=\"false\" style=\"math-depth:0;\">‾</mo></mover><mi>D</mi></msub><mo>∪</mo><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Γ</mi></mpadded><mi>N</mi></msub><mo form=\"postfix\" stretchy=\"false\">)</mo><mo separator=\"true\">,</mo></mrow></mtd></mtr></mtable>",
  // \boldsymbol{\varepsilon}(\mathbf{u})=\tfrac12\left(\nabla\mathbf{u}+\nabla\mathbf{u}^{\mathsf T}\right),\qquad \varepsilon_{ij}=\tfrac12\left(\frac{\partial u_i}{\partial x_j}+\frac{\partial u_j}{\partial x_i}\right)
  strain: "<mrow><mi>𝜺</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>𝐮</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>=</mo><mstyle displaystyle=\"false\" scriptlevel=\"0\"><mfrac><mn>1</mn><mn>2</mn></mfrac></mstyle><mrow><mo fence=\"true\" form=\"prefix\">(</mo><mo>∇</mo><mi>𝐮</mi><mo>+</mo><mo form=\"prefix\" stretchy=\"false\">∇</mo><msup><mi>𝐮</mi><mi>𝖳</mi></msup><mo fence=\"true\" form=\"postfix\">)</mo></mrow><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><msub><mi>ε</mi><mrow><mi>i</mi><mi>j</mi></mrow></msub><mo>=</mo><mstyle displaystyle=\"false\" scriptlevel=\"0\"><mfrac><mn>1</mn><mn>2</mn></mfrac></mstyle><mrow><mo fence=\"true\" form=\"prefix\">(</mo><mfrac><mrow><mi>∂</mi><msub><mi>u</mi><mi>i</mi></msub></mrow><mrow><mi>∂</mi><msub><mi>x</mi><mi>j</mi></msub></mrow></mfrac><mo>+</mo><mfrac><mrow><mi>∂</mi><msub><mi>u</mi><mi>j</mi></msub></mrow><mrow><mi>∂</mi><msub><mi>x</mi><mi>i</mi></msub></mrow></mfrac><mo fence=\"true\" form=\"postfix\">)</mo></mrow></mrow>",
  // \boldsymbol{\sigma}=\lambda\,\operatorname{tr}(\boldsymbol{\varepsilon})\,\mathbf{I}+2\mu\,\boldsymbol{\varepsilon},\qquad \lambda=\frac{E\nu}{(1+\nu)(1-2\nu)},\qquad \mu=\frac{E}{2(1+\nu)}.
  hooke: "<mrow><mi>𝝈</mi><mo>=</mo><mi>λ</mi><mspace width=\"0.1667em\"></mspace><mspace width=\"0.1667em\"></mspace><mi>tr</mi><mo>⁡</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>𝜺</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mspace width=\"0.1667em\"></mspace><mi>𝐈</mi><mo>+</mo><mn>2</mn><mi>μ</mi><mspace width=\"0.1667em\"></mspace><mi>𝜺</mi><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><mi>λ</mi><mo>=</mo><mfrac><mrow><mi>E</mi><mi>ν</mi></mrow><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">(</mo><mn>1</mn><mo>+</mo><mi>ν</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><mn>1</mn><mo>−</mo><mn>2</mn><mi>ν</mi><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></mfrac><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><mi>μ</mi><mo>=</mo><mfrac><mi>E</mi><mrow><mn>2</mn><mo form=\"prefix\" stretchy=\"false\">(</mo><mn>1</mn><mo>+</mo><mi>ν</mi><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></mfrac><mi>.</mi></mrow>",
  // \begin{gathered} \mathbf{D}=\begin{bmatrix}\lambda+2\mu&\lambda&\lambda&0&0&0\\\lambda&\lambda+2\mu&\lambda&0&0&0\\\lambda&\lambda&\lambda+2\mu&0&0&0\\0&0&0&\mu&0&0\\0&0&0&0&\mu&0\\0&0&0&0&0&\mu\end{bmatrix},\\ \hat{\boldsymbol{\sigma}}=\mathbf{D}\,\boldsymbol{\gamma},\qquad \boldsymbol{\gamma}=\bigl(\varepsilon_{11},\varepsilon_{22},\varepsilon_{33},2\varepsilon_{12},2\varepsilon_{13},2\varepsilon_{23}\bigr)^{\mathsf T}. \end{gathered}
  voigt: "<mtable displaystyle=\"true\" class=\"tml-jot\"><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mi>𝐃</mi><mo>=</mo><mrow><mo fence=\"true\" form=\"prefix\">[</mo><mtable><mtr><mtd style=\"padding-left:0em;padding-right:5.9776pt;\"><mrow><mi>λ</mi><mo>+</mo><mn>2</mn><mi>μ</mi></mrow></mtd><mtd style=\"padding-left:5.9776pt;padding-right:5.9776pt;\"><mi>λ</mi></mtd><mtd style=\"padding-left:5.9776pt;padding-right:5.9776pt;\"><mi>λ</mi></mtd><mtd style=\"padding-left:5.9776pt;padding-right:5.9776pt;\"><mn>0</mn></mtd><mtd style=\"padding-left:5.9776pt;padding-right:5.9776pt;\"><mn>0</mn></mtd><mtd style=\"padding-left:5.9776pt;padding-right:0em;\"><mn>0</mn></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:5.9776pt;\"><mi>λ</mi></mtd><mtd style=\"padding-left:5.9776pt;padding-right:5.9776pt;\"><mrow><mi>λ</mi><mo>+</mo><mn>2</mn><mi>μ</mi></mrow></mtd><mtd style=\"padding-left:5.9776pt;padding-right:5.9776pt;\"><mi>λ</mi></mtd><mtd style=\"padding-left:5.9776pt;padding-right:5.9776pt;\"><mn>0</mn></mtd><mtd style=\"padding-left:5.9776pt;padding-right:5.9776pt;\"><mn>0</mn></mtd><mtd style=\"padding-left:5.9776pt;padding-right:0em;\"><mn>0</mn></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:5.9776pt;\"><mi>λ</mi></mtd><mtd style=\"padding-left:5.9776pt;padding-right:5.9776pt;\"><mi>λ</mi></mtd><mtd style=\"padding-left:5.9776pt;padding-right:5.9776pt;\"><mrow><mi>λ</mi><mo>+</mo><mn>2</mn><mi>μ</mi></mrow></mtd><mtd style=\"padding-left:5.9776pt;padding-right:5.9776pt;\"><mn>0</mn></mtd><mtd style=\"padding-left:5.9776pt;padding-right:5.9776pt;\"><mn>0</mn></mtd><mtd style=\"padding-left:5.9776pt;padding-right:0em;\"><mn>0</mn></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:5.9776pt;\"><mn>0</mn></mtd><mtd style=\"padding-left:5.9776pt;padding-right:5.9776pt;\"><mn>0</mn></mtd><mtd style=\"padding-left:5.9776pt;padding-right:5.9776pt;\"><mn>0</mn></mtd><mtd style=\"padding-left:5.9776pt;padding-right:5.9776pt;\"><mi>μ</mi></mtd><mtd style=\"padding-left:5.9776pt;padding-right:5.9776pt;\"><mn>0</mn></mtd><mtd style=\"padding-left:5.9776pt;padding-right:0em;\"><mn>0</mn></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:5.9776pt;\"><mn>0</mn></mtd><mtd style=\"padding-left:5.9776pt;padding-right:5.9776pt;\"><mn>0</mn></mtd><mtd style=\"padding-left:5.9776pt;padding-right:5.9776pt;\"><mn>0</mn></mtd><mtd style=\"padding-left:5.9776pt;padding-right:5.9776pt;\"><mn>0</mn></mtd><mtd style=\"padding-left:5.9776pt;padding-right:5.9776pt;\"><mi>μ</mi></mtd><mtd style=\"padding-left:5.9776pt;padding-right:0em;\"><mn>0</mn></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:5.9776pt;\"><mn>0</mn></mtd><mtd style=\"padding-left:5.9776pt;padding-right:5.9776pt;\"><mn>0</mn></mtd><mtd style=\"padding-left:5.9776pt;padding-right:5.9776pt;\"><mn>0</mn></mtd><mtd style=\"padding-left:5.9776pt;padding-right:5.9776pt;\"><mn>0</mn></mtd><mtd style=\"padding-left:5.9776pt;padding-right:5.9776pt;\"><mn>0</mn></mtd><mtd style=\"padding-left:5.9776pt;padding-right:0em;\"><mi>μ</mi></mtd></mtr></mtable><mo fence=\"true\" form=\"postfix\">]</mo></mrow><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mover><mi>𝝈</mi><mo stretchy=\"false\" style=\"math-depth:0;\">^</mo></mover><mo>=</mo><mi>𝐃</mi><mspace width=\"0.1667em\"></mspace><mi>𝜸</mi><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><mi>𝜸</mi><mo>=</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">(</mo><msub><mi>ε</mi><mn>11</mn></msub><mo separator=\"true\">,</mo><msub><mi>ε</mi><mn>22</mn></msub><mo separator=\"true\">,</mo><msub><mi>ε</mi><mn>33</mn></msub><mo separator=\"true\">,</mo><mn>2</mn><msub><mi>ε</mi><mn>12</mn></msub><mo separator=\"true\">,</mo><mn>2</mn><msub><mi>ε</mi><mn>13</mn></msub><mo separator=\"true\">,</mo><mn>2</mn><msub><mi>ε</mi><mn>23</mn></msub><msup><mrow><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">)</mo><mrow></mrow></mrow><mi>𝖳</mi></msup><mi>.</mi></mrow></mtd></mtr></mtable>",
  // \begin{gathered} \text{find }\mathbf{u}_h\in V_h,\ \ \mathbf{u}_h|_{\Gamma_D}=\mathbf{0},\ \text{such that for all }\mathbf{v}_h\in V_h^{0}:\\ \int_{\Omega}D_{ijkl}\,\varepsilon_{ij}(\mathbf{v}_h)\,\varepsilon_{kl}(\mathbf{u}_h)\,\mathrm{d}\Omega-\int_{\Gamma_N}\mathbf{v}_h\cdot\bar{\mathbf{t}}\,\mathrm{d}\Gamma=0. \end{gathered}
  weakForm: "<mtable displaystyle=\"true\" class=\"tml-jot\"><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mtext>find </mtext><msub><mi>𝐮</mi><mi>h</mi></msub><mo>∈</mo><msub><mi>V</mi><mi>h</mi></msub><mo separator=\"true\">,</mo><mtext> </mtext><mtext> </mtext><msub><mi>𝐮</mi><mi>h</mi></msub><msub><mi>|</mi><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Γ</mi></mpadded><mi>D</mi></msub></msub><mo>=</mo><mn>𝟎</mn><mo separator=\"true\">,</mo><mtext> </mtext><mtext>such that for all </mtext><msub><mi>𝐯</mi><mi>h</mi></msub><mo>∈</mo><msubsup><mi>V</mi><mi>h</mi><mn>0</mn></msubsup><mo lspace=\"0.2222em\" rspace=\"0.2222em\">:</mo></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><msub><mo movablelimits=\"false\">∫</mo><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Ω</mi></mpadded></msub><msub><mi>D</mi><mrow><mi>i</mi><mi>j</mi><mi>k</mi><mi>l</mi></mrow></msub><mspace width=\"0.1667em\"></mspace><msub><mi>ε</mi><mrow><mi>i</mi><mi>j</mi></mrow></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><msub><mi>𝐯</mi><mi>h</mi></msub><mo form=\"postfix\" stretchy=\"false\">)</mo><mspace width=\"0.1667em\"></mspace><msub><mi>ε</mi><mrow><mi>k</mi><mi>l</mi></mrow></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><msub><mi>𝐮</mi><mi>h</mi></msub><mo form=\"postfix\" stretchy=\"false\">)</mo><mspace width=\"0.1667em\"></mspace><mpadded lspace=\"0\"><mi mathvariant=\"normal\">d</mi></mpadded><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Ω</mi></mpadded><mo>−</mo><msub><mo movablelimits=\"false\">∫</mo><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Γ</mi></mpadded><mi>N</mi></msub></msub><msub><mi>𝐯</mi><mi>h</mi></msub><mo>⋅</mo><mover><mi>𝐭</mi><mo stretchy=\"false\" style=\"math-depth:0;\">‾</mo></mover><mspace width=\"0.1667em\"></mspace><mpadded lspace=\"0\"><mi mathvariant=\"normal\">d</mi></mpadded><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Γ</mi></mpadded><mo>=</mo><mn>0.</mn></mrow></mtd></mtr></mtable>",
  // \mathbf{K}\mathbf{U}=\mathbf{F},\qquad \mathbf{K}=\sum_{e}\int_{\Omega_e}\mathbf{B}_e^{\mathsf T}\mathbf{D}_e\mathbf{B}_e\,\mathrm{d}\Omega,\qquad \mathbf{F}=\sum_{T\subset\Gamma_N}\int_{T}\mathbf{N}^{\mathsf T}\bar{\mathbf{t}}\,\mathrm{d}\Gamma,
  discrete: "<mrow><mi>𝐊</mi><mi>𝐔</mi><mo>=</mo><mi>𝐅</mi><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><mi>𝐊</mi><mo>=</mo><mrow><munder><mo movablelimits=\"false\">∑</mo><mi>e</mi></munder></mrow><msub><mo movablelimits=\"false\">∫</mo><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Ω</mi></mpadded><mi>e</mi></msub></msub><msubsup><mi>𝐁</mi><mi>e</mi><mi>𝖳</mi></msubsup><msub><mi>𝐃</mi><mi>e</mi></msub><msub><mi>𝐁</mi><mi>e</mi></msub><mspace width=\"0.1667em\"></mspace><mpadded lspace=\"0\"><mi mathvariant=\"normal\">d</mi></mpadded><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Ω</mi></mpadded><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><mi>𝐅</mi><mo>=</mo><mrow><munder><mo movablelimits=\"false\">∑</mo><mrow><mi>T</mi><mo>⊂</mo><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Γ</mi></mpadded><mi>N</mi></msub></mrow></munder></mrow><msub><mo movablelimits=\"false\">∫</mo><mi>T</mi></msub><msup><mi>𝐍</mi><mi>𝖳</mi></msup><mover><mi>𝐭</mi><mo stretchy=\"false\" style=\"math-depth:0;\">‾</mo></mover><mspace width=\"0.1667em\"></mspace><mpadded lspace=\"0\"><mi mathvariant=\"normal\">d</mi></mpadded><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Γ</mi></mpadded><mo separator=\"true\">,</mo></mrow>",
  // \begin{gathered} \Gamma_D=\{\,a:\ z_a<z_{\min}+h_D\,\},\qquad h_D=15\ \text{mm},\qquad h_N=8\ \text{mm},\\ \Gamma_N=\{\,T\subset\partial\Omega_h:\ \forall a\in T,\ z_a>z_{\max}-h_N\ \wedge\ \lVert\mathbf{x}_a-\mathbf{c}\rVert<25\ \text{mm}\,\}. \end{gathered}
  femurRegions: "<mtable displaystyle=\"true\" class=\"tml-jot\"><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Γ</mi></mpadded><mi>D</mi></msub><mo>=</mo><mo form=\"prefix\" stretchy=\"false\">{</mo><mspace width=\"0.1667em\"></mspace><mi>a</mi><mo lspace=\"0.2222em\" rspace=\"0.2222em\">:</mo><mtext> </mtext><msub><mi>z</mi><mi>a</mi></msub><mo>&lt;</mo><msub><mi>z</mi><mrow><mi>min</mi><mo>⁡</mo></mrow></msub><mo>+</mo><msub><mi>h</mi><mi>D</mi></msub><mspace width=\"0.1667em\"></mspace><mo form=\"postfix\" stretchy=\"false\">}</mo><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><msub><mi>h</mi><mi>D</mi></msub><mo>=</mo><mn>15</mn><mtext> </mtext><mtext>mm</mtext><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><msub><mi>h</mi><mi>N</mi></msub><mo>=</mo><mn>8</mn><mtext> </mtext><mtext>mm</mtext><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Γ</mi></mpadded><mi>N</mi></msub><mo>=</mo><mo form=\"prefix\" stretchy=\"false\">{</mo><mspace width=\"0.1667em\"></mspace><mi>T</mi><mo>⊂</mo><mi>∂</mi><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Ω</mi></mpadded><mi>h</mi></msub><mo lspace=\"0.2222em\" rspace=\"0.2222em\">:</mo><mtext> </mtext><mi>∀</mi><mi>a</mi><mo>∈</mo><mi>T</mi><mo separator=\"true\">,</mo><mtext> </mtext><msub><mi>z</mi><mi>a</mi></msub><mo>&gt;</mo><msub><mi>z</mi><mrow><mi>max</mi><mo>⁡</mo></mrow></msub><mo>−</mo><msub><mi>h</mi><mi>N</mi></msub><mtext> </mtext><mo>∧</mo><mtext> </mtext><mo form=\"prefix\" stretchy=\"false\">‖</mo><msub><mi>𝐱</mi><mi>a</mi></msub><mo>−</mo><mi>𝐜</mi><mo form=\"postfix\" stretchy=\"false\">‖</mo><mo>&lt;</mo><mn>25</mn><mtext> </mtext><mtext>mm</mtext><mspace width=\"0.1667em\"></mspace><mo form=\"postfix\" stretchy=\"false\">}</mo><mi>.</mi></mrow></mtd></mtr></mtable>",
  // \bar{\mathbf{t}}=-\frac{F}{A_N}\,\mathbf{e}_z,\qquad A_N=\sum_{T\in\Gamma_N}\tfrac12\bigl\lVert(\mathbf{x}^T_1-\mathbf{x}^T_0)\times(\mathbf{x}^T_2-\mathbf{x}^T_0)\bigr\rVert,\qquad \int_{\Gamma_N}\bar{\mathbf{t}}\,\mathrm{d}\Gamma=-F\,\mathbf{e}_z.
  traction: "<mrow><mover><mi>𝐭</mi><mo stretchy=\"false\" style=\"math-depth:0;\">‾</mo></mover><mo>=</mo><mo form=\"prefix\" stretchy=\"false\">−</mo><mfrac><mi>F</mi><msub><mi>A</mi><mi>N</mi></msub></mfrac><mspace width=\"0.1667em\"></mspace><msub><mi>𝐞</mi><mi>z</mi></msub><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><msub><mi>A</mi><mi>N</mi></msub><mo>=</mo><mrow><munder><mo movablelimits=\"false\">∑</mo><mrow><mi>T</mi><mo>∈</mo><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Γ</mi></mpadded><mi>N</mi></msub></mrow></munder></mrow><mstyle displaystyle=\"false\" scriptlevel=\"0\"><mfrac><mn>1</mn><mn>2</mn></mfrac></mstyle><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">‖</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><msubsup><mi>𝐱</mi><mn>1</mn><mi>T</mi></msubsup><mo>−</mo><msubsup><mi>𝐱</mi><mn>0</mn><mi>T</mi></msubsup><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>×</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><msubsup><mi>𝐱</mi><mn>2</mn><mi>T</mi></msubsup><mo>−</mo><msubsup><mi>𝐱</mi><mn>0</mn><mi>T</mi></msubsup><mo form=\"postfix\" stretchy=\"false\">)</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">‖</mo><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><msub><mo movablelimits=\"false\">∫</mo><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Γ</mi></mpadded><mi>N</mi></msub></msub><mover><mi>𝐭</mi><mo stretchy=\"false\" style=\"math-depth:0;\">‾</mo></mover><mspace width=\"0.1667em\"></mspace><mpadded lspace=\"0\"><mi mathvariant=\"normal\">d</mi></mpadded><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Γ</mi></mpadded><mo>=</mo><mo form=\"prefix\" stretchy=\"false\">−</mo><mi>F</mi><mspace width=\"0.1667em\"></mspace><msub><mi>𝐞</mi><mi>z</mi></msub><mi>.</mi></mrow>",
  // \begin{gathered} \mathbf{r}=\mathbf{K}\mathbf{U}-\mathbf{F}\ \ (\text{constraints removed}),\qquad \mathbf{R}=\sum_{a\in\Gamma_D}\mathbf{r}_a,\\ e_{\text{free}}=\frac{\lVert\mathbf{r}_{a\notin\Gamma_D}\rVert}{F},\qquad e_{\text{bal}}=\frac{\lVert\mathbf{R}-(0,0,F)\rVert}{F},\qquad \max(e_{\text{free}},e_{\text{bal}})\le10^{-6}. \end{gathered}
  equilibrium: "<mtable displaystyle=\"true\" class=\"tml-jot\"><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mi>𝐫</mi><mo>=</mo><mi>𝐊</mi><mi>𝐔</mi><mo>−</mo><mi>𝐅</mi><mtext> </mtext><mtext> </mtext><mo form=\"prefix\" stretchy=\"false\">(</mo><mtext>constraints removed</mtext><mo form=\"postfix\" stretchy=\"false\">)</mo><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><mi>𝐑</mi><mo>=</mo><mrow><munder><mo movablelimits=\"false\">∑</mo><mrow><mi>a</mi><mo>∈</mo><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Γ</mi></mpadded><mi>D</mi></msub></mrow></munder></mrow><msub><mi>𝐫</mi><mi>a</mi></msub><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><msub><mi>e</mi><mtext>free</mtext></msub><mo>=</mo><mfrac><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">‖</mo><msub><mi>𝐫</mi><mrow><mi>a</mi><mo>∉</mo><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Γ</mi></mpadded><mi>D</mi></msub></mrow></msub><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">‖</mo></mrow><mi>F</mi></mfrac><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><msub><mi>e</mi><mtext>bal</mtext></msub><mo>=</mo><mfrac><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">‖</mo><mi>𝐑</mi><mo>−</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><mn>0,0</mn><mo separator=\"true\">,</mo><mi>F</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">‖</mo></mrow><mi>F</mi></mfrac><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><mrow><mi>max</mi><mo>⁡</mo></mrow><mo form=\"prefix\" stretchy=\"false\">(</mo><msub><mi>e</mi><mtext>free</mtext></msub><mo separator=\"true\">,</mo><msub><mi>e</mi><mtext>bal</mtext></msub><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>≤</mo><msup><mn>10</mn><mrow><mo lspace=\"0em\" rspace=\"0em\">−</mo><mn>6</mn></mrow></msup><mi>.</mi></mrow></mtd></mtr></mtable>",
  // \hat{\boldsymbol{\sigma}}_e=\mathbf{D}_e\,\boldsymbol{\gamma}(\mathbf{u}_h)\big|_{\Omega_e},
  elementStress: "<mrow><msub><mover><mi>𝝈</mi><mo stretchy=\"false\" style=\"math-depth:0;\">^</mo></mover><mi>e</mi></msub><mo>=</mo><msub><mi>𝐃</mi><mi>e</mi></msub><mspace width=\"0.1667em\"></mspace><mi>𝜸</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><msub><mi>𝐮</mi><mi>h</mi></msub><mo form=\"postfix\" stretchy=\"false\">)</mo><msub><mrow><mo fence=\"false\" stretchy=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">|</mo><mrow></mrow></mrow><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Ω</mi></mpadded><mi>e</mi></msub></msub><mo separator=\"true\">,</mo></mrow>",
  // \sigma_{vM}=\sqrt{\tfrac12\Bigl[(\sigma_{11}-\sigma_{22})^2+(\sigma_{22}-\sigma_{33})^2+(\sigma_{33}-\sigma_{11})^2+6\bigl(\sigma_{12}^2+\sigma_{13}^2+\sigma_{23}^2\bigr)\Bigr]}.
  vonMises: "<mrow><msub><mi>σ</mi><mrow><mi>v</mi><mi>M</mi></mrow></msub><mo>=</mo><msqrt><mrow><mstyle displaystyle=\"false\" scriptlevel=\"0\"><mfrac><mn>1</mn><mn>2</mn></mfrac></mstyle><mo fence=\"true\" symmetric=\"true\" minsize=\"1.8em\" maxsize=\"1.8em\">[</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><msub><mi>σ</mi><mn>11</mn></msub><mo>−</mo><msub><mi>σ</mi><mn>22</mn></msub><msup><mo form=\"postfix\" stretchy=\"false\">)</mo><mn>2</mn></msup><mo>+</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><msub><mi>σ</mi><mn>22</mn></msub><mo>−</mo><msub><mi>σ</mi><mn>33</mn></msub><msup><mo form=\"postfix\" stretchy=\"false\">)</mo><mn>2</mn></msup><mo>+</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><msub><mi>σ</mi><mn>33</mn></msub><mo>−</mo><msub><mi>σ</mi><mn>11</mn></msub><msup><mo form=\"postfix\" stretchy=\"false\">)</mo><mn>2</mn></msup><mo>+</mo><mn>6</mn><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">(</mo><msubsup><mi>σ</mi><mn>12</mn><mn>2</mn></msubsup><mo>+</mo><msubsup><mi>σ</mi><mn>13</mn><mn>2</mn></msubsup><mo>+</mo><msubsup><mi>σ</mi><mn>23</mn><mn>2</mn></msubsup><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">)</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.8em\" maxsize=\"1.8em\">]</mo></mrow></msqrt><mi>.</mi></mrow>",
  // \bar\sigma_{vM}(a)=\frac{\sum_{e\ni a}V_e\,\sigma_{vM,e}}{\sum_{e\ni a}V_e}.
  nodalAvg: "<mrow><msub><mover><mi>σ</mi><mo stretchy=\"false\" style=\"math-depth:0;\">‾</mo></mover><mrow><mi>v</mi><mi>M</mi></mrow></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>a</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>=</mo><mfrac><mrow><msub><mo movablelimits=\"false\">∑</mo><mrow><mi>e</mi><mo>∋</mo><mi>a</mi></mrow></msub><msub><mi>V</mi><mi>e</mi></msub><mspace width=\"0.1667em\"></mspace><msub><mi>σ</mi><mrow><mi>v</mi><mi>M</mi><mo separator=\"true\">,</mo><mi>e</mi></mrow></msub></mrow><mrow><msub><mo movablelimits=\"false\">∑</mo><mrow><mi>e</mi><mo>∋</mo><mi>a</mi></mrow></msub><msub><mi>V</mi><mi>e</mi></msub></mrow></mfrac><mi>.</mi></mrow>",
  // R_{\text{stand}}=\frac{\max_{a\in\partial\Omega_h}\bar\sigma_{vM}(a)}{\sigma_{\text{assumed}}}\times100\,\% =\frac{15.8303\ \text{MPa}}{150\ \text{MPa}}\times100\,\%=10.55\,\%.
  stressRatio: "<mrow><msub><mi>R</mi><mtext>stand</mtext></msub><mo>=</mo><mfrac><mrow><msub><mi>max</mi><mrow><mi>a</mi><mo>∈</mo><mi>∂</mi><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Ω</mi></mpadded><mi>h</mi></msub></mrow></msub><mo>⁡</mo><mspace width=\"0.1667em\"></mspace><msub><mover><mi>σ</mi><mo stretchy=\"false\" style=\"math-depth:0;\">‾</mo></mover><mrow><mi>v</mi><mi>M</mi></mrow></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>a</mi><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow><msub><mi>σ</mi><mtext>assumed</mtext></msub></mfrac><mo>×</mo><mn>100</mn><mspace width=\"0.1667em\"></mspace><mi>%</mi><mo>=</mo><mfrac><mrow><mn>15.8303</mn><mtext> </mtext><mtext>MPa</mtext></mrow><mrow><mn>150</mn><mtext> </mtext><mtext>MPa</mtext></mrow></mfrac><mo>×</mo><mn>100</mn><mspace width=\"0.1667em\"></mspace><mi>%</mi><mo>=</mo><mn>10.55</mn><mspace width=\"0.1667em\"></mspace><mi>%</mi><mi>.</mi></mrow>",
  // \rho=\operatorname{clip}\!\left(\frac{\mathrm{HU}+1000}{2000},\,0,\,1.2\right),\qquad \hat\rho=\operatorname{clip}\!\left(\frac{\rho-0.15}{0.85},\,0,\,1\right),
  huDensity: "<mrow><mi>ρ</mi><mo>=</mo><mi>clip</mi><mo>⁡</mo><mspace width=\"0.1667em\"></mspace><mrow style=\"margin-left:-0.1667em;\"></mrow><mrow><mo fence=\"true\" form=\"prefix\">(</mo><mfrac><mrow><mpadded lspace=\"0\"><mi>HU</mi></mpadded><mo>+</mo><mn>1000</mn></mrow><mn>2000</mn></mfrac><mo separator=\"true\">,</mo><mspace width=\"0.1667em\"></mspace><mn>0</mn><mo separator=\"true\">,</mo><mspace width=\"0.1667em\"></mspace><mn>1.2</mn><mo fence=\"true\" form=\"postfix\">)</mo></mrow><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><mover><mi>ρ</mi><mo stretchy=\"false\" style=\"math-depth:0;\">^</mo></mover><mo>=</mo><mi>clip</mi><mo>⁡</mo><mspace width=\"0.1667em\"></mspace><mrow style=\"margin-left:-0.1667em;\"></mrow><mrow><mo fence=\"true\" form=\"prefix\">(</mo><mfrac><mrow><mi>ρ</mi><mo>−</mo><mn>0.15</mn></mrow><mn>0.85</mn></mfrac><mo separator=\"true\">,</mo><mspace width=\"0.1667em\"></mspace><mn>0</mn><mo separator=\"true\">,</mo><mspace width=\"0.1667em\"></mspace><mn>1</mn><mo fence=\"true\" form=\"postfix\">)</mo></mrow><mo separator=\"true\">,</mo></mrow>",
  // E_v=10+15\,\hat\rho\ \ [\text{GPa}]\;=\;10+15\,\operatorname{clip}\!\left(\frac{\mathrm{HU}+700}{1700},\,0,\,1\right),\qquad \nu=0.3.
  huModulus: "<mrow><msub><mi>E</mi><mi>v</mi></msub><mo>=</mo><mn>10</mn><mo>+</mo><mn>15</mn><mspace width=\"0.1667em\"></mspace><mover><mi>ρ</mi><mo stretchy=\"false\" style=\"math-depth:0;\">^</mo></mover><mtext> </mtext><mtext> </mtext><mo form=\"prefix\" stretchy=\"false\">[</mo><mtext>GPa</mtext><mo form=\"postfix\" stretchy=\"false\">]</mo><mspace width=\"0.2778em\"></mspace><mo>=</mo><mspace width=\"0.2778em\"></mspace><mn>10</mn><mo>+</mo><mn>15</mn><mspace width=\"0.1667em\"></mspace><mspace width=\"0.1667em\"></mspace><mi>clip</mi><mo>⁡</mo><mspace width=\"0.1667em\"></mspace><mrow style=\"margin-left:-0.1667em;\"></mrow><mrow><mo fence=\"true\" form=\"prefix\">(</mo><mfrac><mrow><mpadded lspace=\"0\"><mi>HU</mi></mpadded><mo>+</mo><mn>700</mn></mrow><mn>1700</mn></mfrac><mo separator=\"true\">,</mo><mspace width=\"0.1667em\"></mspace><mn>0</mn><mo separator=\"true\">,</mo><mspace width=\"0.1667em\"></mspace><mn>1</mn><mo fence=\"true\" form=\"postfix\">)</mo></mrow><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><mi>ν</mi><mo>=</mo><mn>0.3.</mn></mrow>",
  // \phi_B=\frac{n_B}{f_xf_yf_z},\qquad \bar E_B=\frac{1}{n_B}\sum_{v\in B\cap M}E_v,\qquad E_e=1000\,\bar E_B\,\phi_B\ \ [\text{MPa}]\quad(e\subset B),
  blockModulus: "<mrow><msub><mi>ϕ</mi><mi>B</mi></msub><mo>=</mo><mfrac><msub><mi>n</mi><mi>B</mi></msub><mrow><msub><mi>f</mi><mi>x</mi></msub><msub><mi>f</mi><mi>y</mi></msub><msub><mi>f</mi><mi>z</mi></msub></mrow></mfrac><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><msub><mover><mi>E</mi><mo stretchy=\"false\" class=\"chr-med wbk-med-acc\" style=\"math-depth:0;\">‾</mo></mover><mi>B</mi></msub><mo>=</mo><mfrac><mn>1</mn><msub><mi>n</mi><mi>B</mi></msub></mfrac><mrow><munder><mo movablelimits=\"false\">∑</mo><mrow><mi>v</mi><mo>∈</mo><mi>B</mi><mo>∩</mo><mi>M</mi></mrow></munder></mrow><msub><mi>E</mi><mi>v</mi></msub><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><msub><mi>E</mi><mi>e</mi></msub><mo>=</mo><mn>1000</mn><mspace width=\"0.1667em\"></mspace><msub><mover><mi>E</mi><mo stretchy=\"false\" class=\"chr-med wbk-med-acc\" style=\"math-depth:0;\">‾</mo></mover><mi>B</mi></msub><mspace width=\"0.1667em\"></mspace><msub><mi>ϕ</mi><mi>B</mi></msub><mtext> </mtext><mtext> </mtext><mo form=\"prefix\" stretchy=\"false\">[</mo><mtext>MPa</mtext><mo form=\"postfix\" stretchy=\"false\">]</mo><mspace width=\"1em\"></mspace><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>e</mi><mo>⊂</mo><mi>B</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo separator=\"true\">,</mo></mrow>",
  // \sigma^{\text{bone}}_{vM,e}=\frac{\sigma_{vM,e}}{\phi_{B(e)}},
  boneStress: "<mrow><msubsup><mi>σ</mi><mrow><mi>v</mi><mi>M</mi><mo separator=\"true\">,</mo><mi>e</mi></mrow><mtext>bone</mtext></msubsup><mo>=</mo><mfrac><msub><mi>σ</mi><mrow><mi>v</mi><mi>M</mi><mo separator=\"true\">,</mo><mi>e</mi></mrow></msub><msub><mi>ϕ</mi><mrow><mi>B</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>e</mi><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msub></mfrac><mo separator=\"true\">,</mo></mrow>",
  // \begin{gathered} s_{(1)}\le\dots\le s_{(m)},\qquad W=\sum_{j=1}^{m}n_{(j)},\qquad p=\tfrac{q}{100}\,(W-1),\qquad k=\lfloor p\rfloor,\\ \sigma_{q}=s[k]+(p-k)\bigl(s[\min(k+1,\,W-1)]-s[k]\bigr),\qquad q=99.5, \end{gathered}
  percentile: "<mtable displaystyle=\"true\" class=\"tml-jot\"><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><msub><mi>s</mi><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">(</mo><mn>1</mn><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msub><mo>≤</mo><mo>⋯</mo><mo>≤</mo><msub><mi>s</mi><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">(</mo><mi>m</mi><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msub><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><mi>W</mi><mo>=</mo><mrow><munderover><mo movablelimits=\"false\">∑</mo><mrow><mi>j</mi><mo>=</mo><mn>1</mn></mrow><mi>m</mi></munderover></mrow><msub><mi>n</mi><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">(</mo><mi>j</mi><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msub><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><mi>p</mi><mo>=</mo><mstyle displaystyle=\"false\" scriptlevel=\"0\"><mfrac><mi>q</mi><mn>100</mn></mfrac></mstyle><mspace width=\"0.1667em\"></mspace><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>W</mi><mo>−</mo><mn>1</mn><mo form=\"postfix\" stretchy=\"false\">)</mo><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><mi>k</mi><mo>=</mo><mo form=\"prefix\" stretchy=\"false\">⌊</mo><mi>p</mi><mo form=\"postfix\" stretchy=\"false\">⌋</mo><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><msub><mi>σ</mi><mi>q</mi></msub><mo>=</mo><mi>s</mi><mo form=\"prefix\" stretchy=\"false\">[</mo><mi>k</mi><mo form=\"postfix\" stretchy=\"false\">]</mo><mo>+</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>p</mi><mo>−</mo><mi>k</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">(</mo><mi>s</mi><mo form=\"prefix\" stretchy=\"false\">[</mo><mrow><mi>min</mi><mo>⁡</mo></mrow><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>k</mi><mo>+</mo><mn>1</mn><mo separator=\"true\">,</mo><mspace width=\"0.1667em\"></mspace><mi>W</mi><mo>−</mo><mn>1</mn><mo form=\"postfix\" stretchy=\"false\">)</mo><mo form=\"postfix\" stretchy=\"false\">]</mo><mo>−</mo><mi>s</mi><mo form=\"prefix\" stretchy=\"false\">[</mo><mi>k</mi><mo form=\"postfix\" stretchy=\"false\">]</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">)</mo><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><mi>q</mi><mo>=</mo><mn>99.5</mn><mo separator=\"true\">,</mo></mrow></mtd></mtr></mtable>",
  // I=\operatorname{clip}\!\left(\frac{\sigma_{99.5}}{150\ \text{MPa}}\times100,\ 0,\ 100\right)\ [\%],
  apiIndex: "<mrow><mi>I</mi><mo>=</mo><mi>clip</mi><mo>⁡</mo><mspace width=\"0.1667em\"></mspace><mrow style=\"margin-left:-0.1667em;\"></mrow><mrow><mo fence=\"true\" form=\"prefix\">(</mo><mfrac><msub><mi>σ</mi><mn>99.5</mn></msub><mrow><mn>150</mn><mtext> </mtext><mtext>MPa</mtext></mrow></mfrac><mo>×</mo><mn>100</mn><mo separator=\"true\">,</mo><mtext> </mtext><mn>0</mn><mo separator=\"true\">,</mo><mtext> </mtext><mn>100</mn><mo fence=\"true\" form=\"postfix\">)</mo></mrow><mtext> </mtext><mo form=\"prefix\" stretchy=\"false\">[</mo><mi>%</mi><mo form=\"postfix\" stretchy=\"false\">]</mo><mo separator=\"true\">,</mo></mrow>",
  // V_{\text{bone}}=\frac{N_b\,\Delta_x\Delta_y\Delta_z}{1000}\ [\text{cm}^3],\qquad V_{\text{FE,bone}}=\frac{1}{1000}\sum_e\phi_{B(e)}\,\frac{f_xf_yf_z\,\Delta_x\Delta_y\Delta_z}{6},
  boneVolume: "<mrow><msub><mi>V</mi><mtext>bone</mtext></msub><mo>=</mo><mfrac><mrow><msub><mi>N</mi><mi>b</mi></msub><mspace width=\"0.1667em\"></mspace><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Δ</mi></mpadded><mi>x</mi></msub><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Δ</mi></mpadded><mi>y</mi></msub><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Δ</mi></mpadded><mi>z</mi></msub></mrow><mn>1000</mn></mfrac><mtext> </mtext><mo form=\"prefix\" stretchy=\"false\">[</mo><msup><mtext>cm</mtext><mn>3</mn></msup><mo form=\"postfix\" stretchy=\"false\">]</mo><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><msub><mi>V</mi><mtext>FE,bone</mtext></msub><mo>=</mo><mfrac><mn>1</mn><mn>1000</mn></mfrac><mrow><munder><mo movablelimits=\"false\">∑</mo><mi>e</mi></munder></mrow><msub><mi>ϕ</mi><mrow><mi>B</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>e</mi><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msub><mspace width=\"0.1667em\"></mspace><mfrac><mrow><msub><mi>f</mi><mi>x</mi></msub><msub><mi>f</mi><mi>y</mi></msub><msub><mi>f</mi><mi>z</mi></msub><mspace width=\"0.1667em\"></mspace><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Δ</mi></mpadded><mi>x</mi></msub><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Δ</mi></mpadded><mi>y</mi></msub><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Δ</mi></mpadded><mi>z</mi></msub></mrow><mn>6</mn></mfrac><mo separator=\"true\">,</mo></mrow>",
  // \begin{gathered} b=1.5\,f_z\Delta_z,\qquad F=800\ \text{N},\\ \Gamma_D=\{a:\ z_a<z_{\min}+b\},\qquad \Gamma_N=\{T\subset\partial\Omega_h:\ \forall a\in T,\ z_a>z_{\max}-b\}. \end{gathered}
  uploadBands: "<mtable displaystyle=\"true\" class=\"tml-jot\"><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mi>b</mi><mo>=</mo><mn>1.5</mn><mspace width=\"0.1667em\"></mspace><msub><mi>f</mi><mi>z</mi></msub><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Δ</mi></mpadded><mi>z</mi></msub><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><mi>F</mi><mo>=</mo><mn>800</mn><mtext> </mtext><mtext>N</mtext><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Γ</mi></mpadded><mi>D</mi></msub><mo>=</mo><mo form=\"prefix\" stretchy=\"false\">{</mo><mi>a</mi><mo lspace=\"0.2222em\" rspace=\"0.2222em\">:</mo><mtext> </mtext><msub><mi>z</mi><mi>a</mi></msub><mo>&lt;</mo><msub><mi>z</mi><mrow><mi>min</mi><mo>⁡</mo></mrow></msub><mo>+</mo><mi>b</mi><mo form=\"postfix\" stretchy=\"false\">}</mo><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Γ</mi></mpadded><mi>N</mi></msub><mo>=</mo><mo form=\"prefix\" stretchy=\"false\">{</mo><mi>T</mi><mo>⊂</mo><mi>∂</mi><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Ω</mi></mpadded><mi>h</mi></msub><mo lspace=\"0.2222em\" rspace=\"0.2222em\">:</mo><mtext> </mtext><mi>∀</mi><mi>a</mi><mo>∈</mo><mi>T</mi><mo separator=\"true\">,</mo><mtext> </mtext><msub><mi>z</mi><mi>a</mi></msub><mo>&gt;</mo><msub><mi>z</mi><mrow><mi>max</mi><mo>⁡</mo></mrow></msub><mo>−</mo><mi>b</mi><mo form=\"postfix\" stretchy=\"false\">}</mo><mi>.</mi></mrow></mtd></mtr></mtable>",
  // \begin{gathered} \mathbf{u}_a=\mathbf{0}\ \ (a\in\Gamma_D),\qquad u_{z,a}=-s\ \ (a\in\Gamma_S),\\ \Gamma_S=\{a:\ z_a>z_{\max}-8\ \wedge\ \lVert\mathbf{x}_a-\mathbf{c}\rVert<25\}. \end{gathered}
  pressBc: "<mtable displaystyle=\"true\" class=\"tml-jot\"><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><msub><mi>𝐮</mi><mi>a</mi></msub><mo>=</mo><mn>𝟎</mn><mtext> </mtext><mtext> </mtext><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>a</mi><mo>∈</mo><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Γ</mi></mpadded><mi>D</mi></msub><mo form=\"postfix\" stretchy=\"false\">)</mo><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><msub><mi>u</mi><mrow><mi>z</mi><mo separator=\"true\">,</mo><mi>a</mi></mrow></msub><mo>=</mo><mo form=\"prefix\" stretchy=\"false\">−</mo><mi>s</mi><mtext> </mtext><mtext> </mtext><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>a</mi><mo>∈</mo><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Γ</mi></mpadded><mi>S</mi></msub><mo form=\"postfix\" stretchy=\"false\">)</mo><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Γ</mi></mpadded><mi>S</mi></msub><mo>=</mo><mo form=\"prefix\" stretchy=\"false\">{</mo><mi>a</mi><mo lspace=\"0.2222em\" rspace=\"0.2222em\">:</mo><mtext> </mtext><msub><mi>z</mi><mi>a</mi></msub><mo>&gt;</mo><msub><mi>z</mi><mrow><mi>max</mi><mo>⁡</mo></mrow></msub><mo>−</mo><mn>8</mn><mtext> </mtext><mo>∧</mo><mtext> </mtext><mo form=\"prefix\" stretchy=\"false\">‖</mo><msub><mi>𝐱</mi><mi>a</mi></msub><mo>−</mo><mi>𝐜</mi><mo form=\"postfix\" stretchy=\"false\">‖</mo><mo>&lt;</mo><mn>25</mn><mo form=\"postfix\" stretchy=\"false\">}</mo><mi>.</mi></mrow></mtd></mtr></mtable>",
  // \mathbf{D}_e=(1-d_e)\,\mathbf{D}_0,\qquad \boldsymbol{\sigma}_e=(1-d_e)\bigl(2\mu\,\boldsymbol{\varepsilon}_e+\lambda\operatorname{tr}(\boldsymbol{\varepsilon}_e)\,\mathbf{I}\bigr).
  degraded: "<mrow><msub><mi>𝐃</mi><mi>e</mi></msub><mo>=</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><mn>1</mn><mo>−</mo><msub><mi>d</mi><mi>e</mi></msub><mo form=\"postfix\" stretchy=\"false\">)</mo><mspace width=\"0.1667em\"></mspace><msub><mi>𝐃</mi><mn>0</mn></msub><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><msub><mi>𝝈</mi><mi>e</mi></msub><mo>=</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><mn>1</mn><mo>−</mo><msub><mi>d</mi><mi>e</mi></msub><mo form=\"postfix\" stretchy=\"false\">)</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">(</mo><mn>2</mn><mi>μ</mi><mspace width=\"0.1667em\"></mspace><msub><mi>𝜺</mi><mi>e</mi></msub><mo>+</mo><mi>λ</mi><mspace width=\"0.1667em\"></mspace><mi>tr</mi><mo>⁡</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><msub><mi>𝜺</mi><mi>e</mi></msub><mo form=\"postfix\" stretchy=\"false\">)</mo><mspace width=\"0.1667em\"></mspace><mi>𝐈</mi><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">)</mo><mi>.</mi></mrow>",
  // \mathbf{X}_e\mathbf{G}_e=\mathbf{U}_e,\quad \mathbf{X}_e=\begin{bmatrix}(\mathbf{x}_1-\mathbf{x}_0)^{\mathsf T}\\(\mathbf{x}_2-\mathbf{x}_0)^{\mathsf T}\\(\mathbf{x}_3-\mathbf{x}_0)^{\mathsf T}\end{bmatrix},\quad \mathbf{U}_e=\begin{bmatrix}(\mathbf{u}_1-\mathbf{u}_0)^{\mathsf T}\\(\mathbf{u}_2-\mathbf{u}_0)^{\mathsf T}\\(\mathbf{u}_3-\mathbf{u}_0)^{\mathsf T}\end{bmatrix},\quad \boldsymbol{\varepsilon}_e=\tfrac12\bigl(\mathbf{G}_e+\mathbf{G}_e^{\mathsf T}\bigr).
  cstStrain: "<mrow><msub><mi>𝐗</mi><mi>e</mi></msub><msub><mi>𝐆</mi><mi>e</mi></msub><mo>=</mo><msub><mi>𝐔</mi><mi>e</mi></msub><mo separator=\"true\">,</mo><mspace width=\"1em\"></mspace><msub><mi>𝐗</mi><mi>e</mi></msub><mo>=</mo><mrow><mo fence=\"true\" form=\"prefix\">[</mo><mtable><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mo form=\"prefix\" stretchy=\"false\">(</mo><msub><mi>𝐱</mi><mn>1</mn></msub><mo>−</mo><msub><mi>𝐱</mi><mn>0</mn></msub><msup><mo form=\"postfix\" stretchy=\"false\">)</mo><mi>𝖳</mi></msup></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mo form=\"prefix\" stretchy=\"false\">(</mo><msub><mi>𝐱</mi><mn>2</mn></msub><mo>−</mo><msub><mi>𝐱</mi><mn>0</mn></msub><msup><mo form=\"postfix\" stretchy=\"false\">)</mo><mi>𝖳</mi></msup></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mo form=\"prefix\" stretchy=\"false\">(</mo><msub><mi>𝐱</mi><mn>3</mn></msub><mo>−</mo><msub><mi>𝐱</mi><mn>0</mn></msub><msup><mo form=\"postfix\" stretchy=\"false\">)</mo><mi>𝖳</mi></msup></mrow></mtd></mtr></mtable><mo fence=\"true\" form=\"postfix\">]</mo></mrow><mo separator=\"true\">,</mo><mspace width=\"1em\"></mspace><msub><mi>𝐔</mi><mi>e</mi></msub><mo>=</mo><mrow><mo fence=\"true\" form=\"prefix\">[</mo><mtable><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mo form=\"prefix\" stretchy=\"false\">(</mo><msub><mi>𝐮</mi><mn>1</mn></msub><mo>−</mo><msub><mi>𝐮</mi><mn>0</mn></msub><msup><mo form=\"postfix\" stretchy=\"false\">)</mo><mi>𝖳</mi></msup></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mo form=\"prefix\" stretchy=\"false\">(</mo><msub><mi>𝐮</mi><mn>2</mn></msub><mo>−</mo><msub><mi>𝐮</mi><mn>0</mn></msub><msup><mo form=\"postfix\" stretchy=\"false\">)</mo><mi>𝖳</mi></msup></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mo form=\"prefix\" stretchy=\"false\">(</mo><msub><mi>𝐮</mi><mn>3</mn></msub><mo>−</mo><msub><mi>𝐮</mi><mn>0</mn></msub><msup><mo form=\"postfix\" stretchy=\"false\">)</mo><mi>𝖳</mi></msup></mrow></mtd></mtr></mtable><mo fence=\"true\" form=\"postfix\">]</mo></mrow><mo separator=\"true\">,</mo><mspace width=\"1em\"></mspace><msub><mi>𝜺</mi><mi>e</mi></msub><mo>=</mo><mstyle displaystyle=\"false\" scriptlevel=\"0\"><mfrac><mn>1</mn><mn>2</mn></mfrac></mstyle><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">(</mo><msub><mi>𝐆</mi><mi>e</mi></msub><mo>+</mo><msubsup><mi>𝐆</mi><mi>e</mi><mi>𝖳</mi></msubsup><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">)</mo><mi>.</mi></mrow>",
  // \bar{\boldsymbol{\varepsilon}}_e=\frac{\sum_{f\in\mathcal N_\ell(e)}V_f\,\boldsymbol{\varepsilon}_f}{\sum_{f\in\mathcal N_\ell(e)}V_f},\qquad \mathcal N_\ell(e)=\{f:\ \lVert\mathbf{c}_e-\mathbf{c}_f\rVert\le\ell\}.
  nonlocal: "<mrow><msub><mover><mi>𝜺</mi><mo stretchy=\"false\" style=\"math-depth:0;\">‾</mo></mover><mi>e</mi></msub><mo>=</mo><mfrac><mrow><msub><mo movablelimits=\"false\">∑</mo><mrow><mi>f</mi><mo>∈</mo><msub><mi class=\"mathcal\">𝒩</mi><mi>ℓ</mi></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>e</mi><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msub><msub><mi>V</mi><mi>f</mi></msub><mspace width=\"0.1667em\"></mspace><msub><mi>𝜺</mi><mi>f</mi></msub></mrow><mrow><msub><mo movablelimits=\"false\">∑</mo><mrow><mi>f</mi><mo>∈</mo><msub><mi class=\"mathcal\">𝒩</mi><mi>ℓ</mi></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>e</mi><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msub><msub><mi>V</mi><mi>f</mi></msub></mrow></mfrac><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><msub><mi class=\"mathcal\">𝒩</mi><mi>ℓ</mi></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>e</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>=</mo><mo form=\"prefix\" stretchy=\"false\">{</mo><mi>f</mi><mo lspace=\"0.2222em\" rspace=\"0.2222em\">:</mo><mtext> </mtext><mo form=\"prefix\" stretchy=\"false\">‖</mo><msub><mi>𝐜</mi><mi>e</mi></msub><mo>−</mo><msub><mi>𝐜</mi><mi>f</mi></msub><mo form=\"postfix\" stretchy=\"false\">‖</mo><mo>≤</mo><mi>ℓ</mi><mo form=\"postfix\" stretchy=\"false\">}</mo><mi>.</mi></mrow>",
  // \eta_e=\max\!\left(\frac{\langle\bar\varepsilon_{\mathrm{I},e}\rangle_+}{\varepsilon_t},\ \frac{\langle-\bar\varepsilon_{\mathrm{III},e}\rangle_+}{\varepsilon_c}\right),\qquad \varepsilon_t=0.0073,\quad \varepsilon_c=0.0104,\quad \langle x\rangle_+=\max(x,0),
  failureRatio: "<mrow><msub><mi>η</mi><mi>e</mi></msub><mo>=</mo><mrow><mi>max</mi><mo>⁡</mo><mspace width=\"0.1667em\"></mspace></mrow><mrow style=\"margin-left:-0.1667em;\"></mrow><mrow><mo fence=\"true\" form=\"prefix\">(</mo><mfrac><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">⟨</mo><msub><mover><mi>ε</mi><mo stretchy=\"false\" style=\"math-depth:0;\">‾</mo></mover><mrow><mpadded lspace=\"0\"><mi mathvariant=\"normal\">I</mi></mpadded><mo separator=\"true\">,</mo><mi>e</mi></mrow></msub><msub><mo form=\"postfix\" stretchy=\"false\">⟩</mo><mo>+</mo></msub></mrow><msub><mi>ε</mi><mi>t</mi></msub></mfrac><mo separator=\"true\">,</mo><mtext> </mtext><mfrac><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">⟨</mo><mo form=\"prefix\" stretchy=\"false\">−</mo><msub><mover><mi>ε</mi><mo stretchy=\"false\" style=\"math-depth:0;\">‾</mo></mover><mrow><mpadded lspace=\"0\"><mi>III</mi></mpadded><mo separator=\"true\">,</mo><mi>e</mi></mrow></msub><msub><mo form=\"postfix\" stretchy=\"false\">⟩</mo><mo>+</mo></msub></mrow><msub><mi>ε</mi><mi>c</mi></msub></mfrac><mo fence=\"true\" form=\"postfix\">)</mo></mrow><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><msub><mi>ε</mi><mi>t</mi></msub><mo>=</mo><mn>0.0073</mn><mo separator=\"true\">,</mo><mspace width=\"1em\"></mspace><msub><mi>ε</mi><mi>c</mi></msub><mo>=</mo><mn>0.0104</mn><mo separator=\"true\">,</mo><mspace width=\"1em\"></mspace><mo form=\"prefix\" stretchy=\"false\">⟨</mo><mi>x</mi><msub><mo form=\"postfix\" stretchy=\"false\">⟩</mo><mo>+</mo></msub><mo>=</mo><mrow><mi>max</mi><mo>⁡</mo></mrow><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>x</mi><mo separator=\"true\">,</mo><mn>0</mn><mo form=\"postfix\" stretchy=\"false\">)</mo><mo separator=\"true\">,</mo></mrow>",
  // \kappa_e^{\,n+1}=\max\!\bigl(\kappa_e^{\,n},\ \eta_e(\mathbf{u}^{n+1})\bigr).
  history: "<mrow><msubsup><mi>κ</mi><mi>e</mi><mrow><mspace width=\"0.1667em\"></mspace><mi>n</mi><mo>+</mo><mn>1</mn></mrow></msubsup><mo>=</mo><mrow><mi>max</mi><mo>⁡</mo><mspace width=\"0.1667em\"></mspace></mrow><mrow style=\"margin-left:-0.1667em;\"></mrow><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">(</mo><msubsup><mi>κ</mi><mi>e</mi><mrow><mspace width=\"0.1667em\"></mspace><mi>n</mi></mrow></msubsup><mo separator=\"true\">,</mo><mtext> </mtext><msub><mi>η</mi><mi>e</mi></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><msup><mi>𝐮</mi><mrow><mi>n</mi><mo>+</mo><mn>1</mn></mrow></msup><mo form=\"postfix\" stretchy=\"false\">)</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">)</mo><mi>.</mi></mrow>",
  // d(\kappa)=\min\!\left(1-r,\ \max\!\left(0,\ 1-\frac{e^{-\beta(\hat\kappa-1)}}{\hat\kappa}\right)\right),\qquad \hat\kappa=\max(\kappa,1),\quad \beta=3,\quad r=0.005.
  damageLaw: "<mrow><mi>d</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>κ</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>=</mo><mrow><mi>min</mi><mo>⁡</mo><mspace width=\"0.1667em\"></mspace></mrow><mrow style=\"margin-left:-0.1667em;\"></mrow><mrow><mo fence=\"true\" form=\"prefix\">(</mo><mn>1</mn><mo>−</mo><mi>r</mi><mo separator=\"true\">,</mo><mtext> </mtext><mrow><mi>max</mi><mo>⁡</mo><mspace width=\"0.1667em\"></mspace></mrow><mrow style=\"margin-left:-0.1667em;\"></mrow><mrow><mo fence=\"true\" form=\"prefix\">(</mo><mn>0</mn><mo separator=\"true\">,</mo><mtext> </mtext><mn>1</mn><mo>−</mo><mfrac><msup><mi>e</mi><mrow class=\"tml-sml-pad\"><mo lspace=\"0em\" rspace=\"0em\">−</mo><mi>β</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mover><mi>κ</mi><mo stretchy=\"false\" style=\"math-depth:0;\">^</mo></mover><mo>−</mo><mn>1</mn><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msup><mover><mi>κ</mi><mo stretchy=\"false\" style=\"math-depth:0;\">^</mo></mover></mfrac><mo fence=\"true\" form=\"postfix\">)</mo></mrow><mo fence=\"true\" form=\"postfix\">)</mo></mrow><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><mover><mi>κ</mi><mo stretchy=\"false\" style=\"math-depth:0;\">^</mo></mover><mo>=</mo><mrow><mi>max</mi><mo>⁡</mo></mrow><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>κ</mi><mo separator=\"true\">,</mo><mn>1</mn><mo form=\"postfix\" stretchy=\"false\">)</mo><mo separator=\"true\">,</mo><mspace width=\"1em\"></mspace><mi>β</mi><mo>=</mo><mn>3</mn><mo separator=\"true\">,</mo><mspace width=\"1em\"></mspace><mi>r</mi><mo>=</mo><mn>0.005.</mn></mrow>",
  // e\in\mathcal E\iff c_{e,z}>z_{\min}+30\ \text{mm}\ \wedge\ \lVert\mathbf{c}_e-\mathbf{c}\rVert>30\ \text{mm},\qquad d_e\equiv0\ \ \text{for }e\notin\mathcal E.
  fixture: "<mrow><mi>e</mi><mo>∈</mo><mi class=\"mathcal\">ℰ</mi><mspace width=\"0.2778em\"></mspace><mo stretchy=\"false\">⟺</mo><mspace width=\"0.2778em\"></mspace><msub><mi>c</mi><mrow><mi>e</mi><mo separator=\"true\">,</mo><mi>z</mi></mrow></msub><mo>&gt;</mo><msub><mi>z</mi><mrow><mi>min</mi><mo>⁡</mo></mrow></msub><mo>+</mo><mn>30</mn><mtext> </mtext><mtext>mm</mtext><mtext> </mtext><mo>∧</mo><mtext> </mtext><mo form=\"prefix\" stretchy=\"false\">‖</mo><msub><mi>𝐜</mi><mi>e</mi></msub><mo>−</mo><mi>𝐜</mi><mo form=\"postfix\" stretchy=\"false\">‖</mo><mo>&gt;</mo><mn>30</mn><mtext> </mtext><mtext>mm</mtext><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><msub><mi>d</mi><mi>e</mi></msub><mo>≡</mo><mn>0</mn><mtext> </mtext><mtext> </mtext><mtext>for </mtext><mi>e</mi><mo>∉</mo><mi class=\"mathcal\">ℰ</mi><mi>.</mi></mrow>",
  // \begin{gathered} s_0=\frac{1\ \text{mm}}{\max_{e\in\mathcal E}\eta_e\big|_{s=1\,\text{mm},\ \mathbf{d}=\mathbf{0}}}=1.9344\ \text{mm},\qquad s_k=r_k\,s_0,\\ r_k\in\{0,\,0.15,\,0.3,\,0.45,\,0.6,\,0.75,\,0.9,\,1,\,1.05,\,1.1,\,1.2,\,1.35,\,1.5,\,1.75,\,2\}. \end{gathered}
  onset: "<mtable displaystyle=\"true\" class=\"tml-jot\"><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><msub><mi>s</mi><mn>0</mn></msub><mo>=</mo><mfrac><mrow><mn>1</mn><mtext> </mtext><mtext>mm</mtext></mrow><mrow><msub><mi>max</mi><mrow><mi>e</mi><mo>∈</mo><mi class=\"mathcal\">ℰ</mi></mrow></msub><mo>⁡</mo><mspace width=\"0.1667em\"></mspace><msub><mi>η</mi><mi>e</mi></msub><msub><mrow><mo fence=\"false\" stretchy=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">|</mo><mrow></mrow></mrow><mrow><mi>s</mi><mo>=</mo><mn>1</mn><mspace width=\"0.1667em\"></mspace><mtext>mm</mtext><mo separator=\"true\">,</mo><mtext> </mtext><mi>𝐝</mi><mo>=</mo><mn>𝟎</mn></mrow></msub></mrow></mfrac><mo>=</mo><mn>1.9344</mn><mtext> </mtext><mtext>mm</mtext><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><msub><mi>s</mi><mi>k</mi></msub><mo>=</mo><msub><mi>r</mi><mi>k</mi></msub><mspace width=\"0.1667em\"></mspace><msub><mi>s</mi><mn>0</mn></msub><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><msub><mi>r</mi><mi>k</mi></msub><mo>∈</mo><mo form=\"prefix\" stretchy=\"false\">{</mo><mn>0</mn><mo separator=\"true\">,</mo><mspace width=\"0.1667em\"></mspace><mn>0.15</mn><mo separator=\"true\">,</mo><mspace width=\"0.1667em\"></mspace><mn>0.3</mn><mo separator=\"true\">,</mo><mspace width=\"0.1667em\"></mspace><mn>0.45</mn><mo separator=\"true\">,</mo><mspace width=\"0.1667em\"></mspace><mn>0.6</mn><mo separator=\"true\">,</mo><mspace width=\"0.1667em\"></mspace><mn>0.75</mn><mo separator=\"true\">,</mo><mspace width=\"0.1667em\"></mspace><mn>0.9</mn><mo separator=\"true\">,</mo><mspace width=\"0.1667em\"></mspace><mn>1</mn><mo separator=\"true\">,</mo><mspace width=\"0.1667em\"></mspace><mn>1.05</mn><mo separator=\"true\">,</mo><mspace width=\"0.1667em\"></mspace><mn>1.1</mn><mo separator=\"true\">,</mo><mspace width=\"0.1667em\"></mspace><mn>1.2</mn><mo separator=\"true\">,</mo><mspace width=\"0.1667em\"></mspace><mn>1.35</mn><mo separator=\"true\">,</mo><mspace width=\"0.1667em\"></mspace><mn>1.5</mn><mo separator=\"true\">,</mo><mspace width=\"0.1667em\"></mspace><mn>1.75</mn><mo separator=\"true\">,</mo><mspace width=\"0.1667em\"></mspace><mn>2</mn><mo form=\"postfix\" stretchy=\"false\">}</mo><mi>.</mi></mrow></mtd></mtr></mtable>",
  // \begin{gathered} \tilde{\mathbf d}^{(i)}=\max\!\Bigl(\mathbf d^{n},\ d\bigl(\max(\boldsymbol\kappa^{n},\,\boldsymbol\eta(\mathbf u(\mathbf d^{(i)})))\bigr)\Bigr)\ \text{on }\mathcal E,\qquad \tilde d^{(i)}_e=0\ \text{off }\mathcal E,\\ \text{stop if }\bigl\lVert\tilde{\mathbf d}^{(i)}-\mathbf d^{(i)}\bigr\rVert_\infty<0.002,\quad\text{else}\quad \mathbf d^{(i+1)}=\max\!\bigl(\mathbf d^{n},\ \tfrac12\mathbf d^{(i)}+\tfrac12\tilde{\mathbf d}^{(i)}\bigr). \end{gathered}
  staggered: "<mtable displaystyle=\"true\" class=\"tml-jot\"><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><msup><mover><mi>𝐝</mi><mo stretchy=\"false\" style=\"math-depth:0;\">~</mo></mover><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">(</mo><mi>i</mi><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msup><mo>=</mo><mrow><mi>max</mi><mo>⁡</mo><mspace width=\"0.1667em\"></mspace></mrow><mrow style=\"margin-left:-0.1667em;\"></mrow><mo fence=\"true\" symmetric=\"true\" minsize=\"1.8em\" maxsize=\"1.8em\">(</mo><msup><mi>𝐝</mi><mi>n</mi></msup><mo separator=\"true\">,</mo><mtext> </mtext><mi>d</mi><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">(</mo><mrow><mi>max</mi><mo>⁡</mo></mrow><mo form=\"prefix\" stretchy=\"false\">(</mo><msup><mi>𝜿</mi><mi>n</mi></msup><mo separator=\"true\">,</mo><mspace width=\"0.1667em\"></mspace><mi>𝜼</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>𝐮</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><msup><mi>𝐝</mi><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">(</mo><mi>i</mi><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msup><mo form=\"postfix\" stretchy=\"false\">)</mo><mo form=\"postfix\" stretchy=\"false\">)</mo><mo form=\"postfix\" stretchy=\"false\">)</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">)</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.8em\" maxsize=\"1.8em\">)</mo><mtext> </mtext><mtext>on </mtext><mi class=\"mathcal\">ℰ</mi><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><msubsup><mover><mi>d</mi><mo stretchy=\"false\" class=\"chr-lrg wbk-lrg\" style=\"math-depth:0;\">~</mo></mover><mi>e</mi><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">(</mo><mi>i</mi><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msubsup><mo>=</mo><mn>0</mn><mtext> </mtext><mtext>off </mtext><mi class=\"mathcal\">ℰ</mi><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mtext>stop if </mtext><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">‖</mo><msup><mover><mi>𝐝</mi><mo stretchy=\"false\" style=\"math-depth:0;\">~</mo></mover><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">(</mo><mi>i</mi><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msup><mo>−</mo><msup><mi>𝐝</mi><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">(</mo><mi>i</mi><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msup><msub><mrow><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">‖</mo><mrow></mrow></mrow><mi>∞</mi></msub><mo>&lt;</mo><mn>0.002</mn><mo separator=\"true\">,</mo><mspace width=\"1em\"></mspace><mtext>else</mtext><mspace width=\"1em\"></mspace><msup><mi>𝐝</mi><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">(</mo><mi>i</mi><mo>+</mo><mn>1</mn><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msup><mo>=</mo><mrow><mi>max</mi><mo>⁡</mo><mspace width=\"0.1667em\"></mspace></mrow><mrow style=\"margin-left:-0.1667em;\"></mrow><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">(</mo><msup><mi>𝐝</mi><mi>n</mi></msup><mo separator=\"true\">,</mo><mtext> </mtext><mstyle displaystyle=\"false\" scriptlevel=\"0\"><mfrac><mn>1</mn><mn>2</mn></mfrac></mstyle><msup><mi>𝐝</mi><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">(</mo><mi>i</mi><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msup><mo>+</mo><mstyle displaystyle=\"false\" scriptlevel=\"0\"><mfrac><mn>1</mn><mn>2</mn></mfrac></mstyle><msup><mover><mi>𝐝</mi><mo stretchy=\"false\" style=\"math-depth:0;\">~</mo></mover><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">(</mo><mi>i</mi><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msup><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">)</mo><mi>.</mi></mrow></mtd></mtr></mtable>",
  // P=-\sum_{a\in\Gamma_S}r_{a,z},\qquad e_{\text{free}}=\frac{\lVert\mathbf r_{\text{free}}\rVert}{\max(|P|,1)}\le10^{-6},\qquad e_{\text{bal}}=\frac{\lVert\mathbf R_D-(0,0,P)\rVert}{\max(|P|,1)}\le10^{-6},
  pressLoad: "<mrow><mi>P</mi><mo>=</mo><mo form=\"prefix\" stretchy=\"false\">−</mo><mrow><munder><mo movablelimits=\"false\">∑</mo><mrow><mi>a</mi><mo>∈</mo><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Γ</mi></mpadded><mi>S</mi></msub></mrow></munder></mrow><msub><mi>r</mi><mrow><mi>a</mi><mo separator=\"true\">,</mo><mi>z</mi></mrow></msub><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><msub><mi>e</mi><mtext>free</mtext></msub><mo>=</mo><mfrac><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">‖</mo><msub><mi>𝐫</mi><mtext>free</mtext></msub><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">‖</mo></mrow><mrow><mrow><mi>max</mi><mo>⁡</mo></mrow><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>|</mi><mi>P</mi><mi>|</mi><mo separator=\"true\">,</mo><mn>1</mn><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></mfrac><mo>≤</mo><msup><mn>10</mn><mrow><mo lspace=\"0em\" rspace=\"0em\">−</mo><mn>6</mn></mrow></msup><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><msub><mi>e</mi><mtext>bal</mtext></msub><mo>=</mo><mfrac><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">‖</mo><msub><mi>𝐑</mi><mi>D</mi></msub><mo>−</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><mn>0,0</mn><mo separator=\"true\">,</mo><mi>P</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">‖</mo></mrow><mrow><mrow><mi>max</mi><mo>⁡</mo></mrow><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>|</mi><mi>P</mi><mi>|</mi><mo separator=\"true\">,</mo><mn>1</mn><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></mfrac><mo>≤</mo><msup><mn>10</mn><mrow><mo lspace=\"0em\" rspace=\"0em\">−</mo><mn>6</mn></mrow></msup><mo separator=\"true\">,</mo></mrow>",
  // \text{damaged}=100\,\frac{\sum_{e:\,d_e>0.05}V_e}{\sum_eV_e}\ \%,\qquad \text{eroded}=100\,\frac{\sum_{e:\,d_e\ge0.95}V_e}{\sum_eV_e}\ \%.
  volFractions: "<mrow><mtext>damaged</mtext><mo>=</mo><mn>100</mn><mspace width=\"0.1667em\"></mspace><mfrac><mrow><msub><mo movablelimits=\"false\">∑</mo><mrow><mi>e</mi><mo lspace=\"0.2222em\" rspace=\"0.2222em\">:</mo><mspace width=\"0.1667em\"></mspace><msub><mi>d</mi><mi>e</mi></msub><mo>&gt;</mo><mn>0.05</mn></mrow></msub><msub><mi>V</mi><mi>e</mi></msub></mrow><mrow><msub><mo movablelimits=\"false\">∑</mo><mi>e</mi></msub><msub><mi>V</mi><mi>e</mi></msub></mrow></mfrac><mtext> </mtext><mi>%</mi><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><mtext>eroded</mtext><mo>=</mo><mn>100</mn><mspace width=\"0.1667em\"></mspace><mfrac><mrow><msub><mo movablelimits=\"false\">∑</mo><mrow><mi>e</mi><mo lspace=\"0.2222em\" rspace=\"0.2222em\">:</mo><mspace width=\"0.1667em\"></mspace><msub><mi>d</mi><mi>e</mi></msub><mo>≥</mo><mn>0.95</mn></mrow></msub><msub><mi>V</mi><mi>e</mi></msub></mrow><mrow><msub><mo movablelimits=\"false\">∑</mo><mi>e</mi></msub><msub><mi>V</mi><mi>e</mi></msub></mrow></mfrac><mtext> </mtext><mi>%</mi><mi>.</mi></mrow>",
  // r^{\mathrm{ARF0}}_i=\sum_{j=1}^{N}\mathbf 1\!\left[A_j<A_i\right],\qquad r^{\mathrm{MSF}}_i=\sum_{j=1}^{N}\mathbf 1\!\left[M_j>M_i\right].
  ranks: "<mrow><msubsup><mi>r</mi><mi>i</mi><mpadded lspace=\"0\" class=\"tml-sml-pad\"><mi>ARF0</mi></mpadded></msubsup><mo>=</mo><mrow><munderover><mo movablelimits=\"false\">∑</mo><mrow><mi>j</mi><mo>=</mo><mn>1</mn></mrow><mi>N</mi></munderover></mrow><mn>𝟏</mn><mrow style=\"margin-left:-0.1667em;\"></mrow><mrow><mo fence=\"true\" form=\"prefix\">[</mo><msub><mi>A</mi><mi>j</mi></msub><mo>&lt;</mo><msub><mi>A</mi><mi>i</mi></msub><mo fence=\"true\" form=\"postfix\">]</mo></mrow><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><msubsup><mi>r</mi><mi>i</mi><mpadded lspace=\"0\" class=\"tml-sml-pad\"><mi>MSF</mi></mpadded></msubsup><mo>=</mo><mrow><munderover><mo movablelimits=\"false\">∑</mo><mrow><mi>j</mi><mo>=</mo><mn>1</mn></mrow><mi>N</mi></munderover></mrow><mn>𝟏</mn><mrow style=\"margin-left:-0.1667em;\"></mrow><mrow><mo fence=\"true\" form=\"prefix\">[</mo><msub><mi>M</mi><mi>j</mi></msub><mo>&gt;</mo><msub><mi>M</mi><mi>i</mi></msub><mo fence=\"true\" form=\"postfix\">]</mo></mrow><mi>.</mi></mrow>",
  // Q_p=x_{(\lfloor h\rfloor)}+(h-\lfloor h\rfloor)\bigl(x_{(\lfloor h\rfloor+1)}-x_{(\lfloor h\rfloor)}\bigr),\qquad h=(N-1)\,p,\qquad p\in\{0.25,\,0.5,\,0.75\}.
  quartile: "<mrow><msub><mi>Q</mi><mi>p</mi></msub><mo>=</mo><msub><mi>x</mi><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">(</mo><mo form=\"prefix\" stretchy=\"false\">⌊</mo><mi>h</mi><mo form=\"postfix\" stretchy=\"false\">⌋</mo><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msub><mo>+</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>h</mi><mo>−</mo><mo form=\"prefix\" stretchy=\"false\">⌊</mo><mi>h</mi><mo form=\"postfix\" stretchy=\"false\">⌋</mo><mo form=\"postfix\" stretchy=\"false\">)</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">(</mo><msub><mi>x</mi><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">(</mo><mo form=\"prefix\" stretchy=\"false\">⌊</mo><mi>h</mi><mo form=\"postfix\" stretchy=\"false\">⌋</mo><mo>+</mo><mn>1</mn><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msub><mo>−</mo><msub><mi>x</mi><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">(</mo><mo form=\"prefix\" stretchy=\"false\">⌊</mo><mi>h</mi><mo form=\"postfix\" stretchy=\"false\">⌋</mo><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msub><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">)</mo><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><mi>h</mi><mo>=</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>N</mi><mo>−</mo><mn>1</mn><mo form=\"postfix\" stretchy=\"false\">)</mo><mspace width=\"0.1667em\"></mspace><mi>p</mi><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><mi>p</mi><mo>∈</mo><mo form=\"prefix\" stretchy=\"false\">{</mo><mn>0.25</mn><mo separator=\"true\">,</mo><mspace width=\"0.1667em\"></mspace><mn>0.5</mn><mo separator=\"true\">,</mo><mspace width=\"0.1667em\"></mspace><mn>0.75</mn><mo form=\"postfix\" stretchy=\"false\">}</mo><mi>.</mi></mrow>",
  // \Phi_i=\left[\operatorname{round}\!\left(\frac{F_{\text{low}}}{M_i},2\right),\ \operatorname{round}\!\left(\frac{F_{\text{high}}}{M_i},2\right)\right] =\left[\frac{2900}{1338.86},\ \frac{4260}{1338.86}\right]=[2.17,\ 3.18].
  factorRisk: "<mrow><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Φ</mi></mpadded><mi>i</mi></msub><mo>=</mo><mrow><mo fence=\"true\" form=\"prefix\">[</mo><mi>round</mi><mo>⁡</mo><mspace width=\"0.1667em\"></mspace><mrow style=\"margin-left:-0.1667em;\"></mrow><mrow><mo fence=\"true\" form=\"prefix\">(</mo><mfrac><msub><mi>F</mi><mtext>low</mtext></msub><msub><mi>M</mi><mi>i</mi></msub></mfrac><mo separator=\"true\">,</mo><mn>2</mn><mo fence=\"true\" form=\"postfix\">)</mo></mrow><mo separator=\"true\">,</mo><mtext> </mtext><mi>round</mi><mo>⁡</mo><mspace width=\"0.1667em\"></mspace><mrow style=\"margin-left:-0.1667em;\"></mrow><mrow><mo fence=\"true\" form=\"prefix\">(</mo><mfrac><msub><mi>F</mi><mtext>high</mtext></msub><msub><mi>M</mi><mi>i</mi></msub></mfrac><mo separator=\"true\">,</mo><mn>2</mn><mo fence=\"true\" form=\"postfix\">)</mo></mrow><mo fence=\"true\" form=\"postfix\">]</mo></mrow><mo>=</mo><mrow><mo fence=\"true\" form=\"prefix\">[</mo><mfrac><mn>2900</mn><mn>1338.86</mn></mfrac><mo separator=\"true\">,</mo><mtext> </mtext><mfrac><mn>4260</mn><mn>1338.86</mn></mfrac><mo fence=\"true\" form=\"postfix\">]</mo></mrow><mo>=</mo><mo form=\"prefix\" stretchy=\"false\">[</mo><mn>2.17</mn><mo separator=\"true\">,</mo><mtext> </mtext><mn>3.18</mn><mo form=\"postfix\" stretchy=\"false\">]</mo><mi>.</mi></mrow>",
  // c=\begin{cases} \text{exceeds the MSF of every femur in the study} & F_{\text{low}}>\max_j M_j,\\ \text{exceeds its strength} & \Phi^{\text{low}}>1,\\ \text{stays below its strength} & \Phi^{\text{high}}<1,\\ \text{about reaches its strength} & \text{otherwise.} \end{cases}
  templateRule: "<mrow><mi>c</mi><mo>=</mo><mrow><mo fence=\"true\" form=\"prefix\">{</mo><mtable><mtr><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mtext>exceeds the MSF of every femur in the study</mtext></mtd><mtd class=\"tml-left\" style=\"padding-left:1em;padding-right:0em;\"><mrow><msub><mi>F</mi><mtext>low</mtext></msub><mo>&gt;</mo><msub><mi>max</mi><mi>j</mi></msub><mo>⁡</mo><mspace width=\"0.1667em\"></mspace><msub><mi>M</mi><mi>j</mi></msub><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mtext>exceeds its strength</mtext></mtd><mtd class=\"tml-left\" style=\"padding-left:1em;padding-right:0em;\"><mrow><msup><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Φ</mi></mpadded><mtext>low</mtext></msup><mo>&gt;</mo><mn>1</mn><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mtext>stays below its strength</mtext></mtd><mtd class=\"tml-left\" style=\"padding-left:1em;padding-right:0em;\"><mrow><msup><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Φ</mi></mpadded><mtext>high</mtext></msup><mo>&lt;</mo><mn>1</mn><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mtext>about reaches its strength</mtext></mtd><mtd class=\"tml-left\" style=\"padding-left:1em;padding-right:0em;\"><mtext>otherwise.</mtext></mtd></mtr></mtable><mo fence=\"true\" form=\"postfix\"></mo></mrow></mrow>",
  // \begin{gathered} \mathrm{verified}(f)\iff k_{\text{idx}}(f)=k(f)\ \wedge\ h_{\text{idx}}(f)=h_{\text{pin}}(f)\ \wedge\ |b_f|=n_{\text{idx}}(f)\\ \wedge\ \operatorname{SHA256}(b_f)=h_{\text{pin}}(f)\ \wedge\ \mathrm{JSON}(b_f)\ne\bot. \end{gathered}
  grounded: "<mtable displaystyle=\"true\" class=\"tml-jot\"><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mpadded lspace=\"0\"><mi>verified</mi></mpadded><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>f</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mspace width=\"0.2778em\"></mspace><mo stretchy=\"false\">⟺</mo><mspace width=\"0.2778em\"></mspace><msub><mi>k</mi><mtext>idx</mtext></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>f</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>=</mo><mi>k</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>f</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mtext> </mtext><mo>∧</mo><mtext> </mtext><msub><mi>h</mi><mtext>idx</mtext></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>f</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>=</mo><msub><mi>h</mi><mtext>pin</mtext></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>f</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mtext> </mtext><mo>∧</mo><mtext> </mtext><mi>|</mi><msub><mi>b</mi><mi>f</mi></msub><mi>|</mi><mo>=</mo><msub><mi>n</mi><mtext>idx</mtext></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>f</mi><mo form=\"postfix\" stretchy=\"false\">)</mo></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mo>∧</mo><mtext> </mtext><mi>SHA256</mi><mo>⁡</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><msub><mi>b</mi><mi>f</mi></msub><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>=</mo><msub><mi>h</mi><mtext>pin</mtext></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>f</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mtext> </mtext><mo>∧</mo><mtext> </mtext><mpadded lspace=\"0\"><mi>JSON</mi></mpadded><mo form=\"prefix\" stretchy=\"false\">(</mo><msub><mi>b</mi><mi>f</mi></msub><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>≠</mo><mi>⊥</mi><mi>.</mi></mrow></mtd></mtr></mtable>",
  // G(f)=\begin{cases} (\text{bucket},\ \text{verified}) & \mathrm{verified}(f),\\ (\text{local backup},\ \text{verified}) & \neg\,\mathrm{verified}(f)\ \wedge\ \operatorname{SHA256}(b^{\text{local}}_f)=h_{\text{pin}}(f),\\ \text{HTTP 503, no model call} & \text{otherwise.} \end{cases}
  fallbackG: "<mrow><mi>G</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>f</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>=</mo><mrow><mo fence=\"true\" form=\"prefix\">{</mo><mtable><mtr><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mrow><mo form=\"prefix\" stretchy=\"false\">(</mo><mtext>bucket</mtext><mo separator=\"true\">,</mo><mtext> </mtext><mtext>verified</mtext><mo form=\"postfix\" stretchy=\"false\">)</mo></mrow></mtd><mtd class=\"tml-left\" style=\"padding-left:1em;padding-right:0em;\"><mrow><mpadded lspace=\"0\"><mi>verified</mi></mpadded><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>f</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mrow><mo form=\"prefix\" stretchy=\"false\">(</mo><mtext>local backup</mtext><mo separator=\"true\">,</mo><mtext> </mtext><mtext>verified</mtext><mo form=\"postfix\" stretchy=\"false\">)</mo></mrow></mtd><mtd class=\"tml-left\" style=\"padding-left:1em;padding-right:0em;\"><mrow><mo form=\"prefix\" stretchy=\"false\">¬</mo><mspace width=\"0.1667em\"></mspace><mpadded lspace=\"0\"><mi>verified</mi></mpadded><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>f</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mtext> </mtext><mo>∧</mo><mtext> </mtext><mi>SHA256</mi><mo>⁡</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><msubsup><mi>b</mi><mi>f</mi><mtext>local</mtext></msubsup><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>=</mo><msub><mi>h</mi><mtext>pin</mtext></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>f</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mtext>HTTP 503, no model call</mtext></mtd><mtd class=\"tml-left\" style=\"padding-left:1em;padding-right:0em;\"><mtext>otherwise.</mtext></mtd></mtr></mtable><mo fence=\"true\" form=\"postfix\"></mo></mrow></mrow>",
  // d=\operatorname{SHA256}\Bigl(\mathrm{JSON}_{\text{sorted}}\bigl[\,\texttt{ask-tools-7},\ \{(k,h,\text{store},\text{verified})\}_{\text{risk, fe}},\ \{\text{id}\mapsto\text{text}\}\,\bigr]\Bigr).
  askDigest: "<mrow><mi>d</mi><mo>=</mo><mi>SHA256</mi><mo>⁡</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.8em\" maxsize=\"1.8em\">(</mo><msub><mpadded lspace=\"0\"><mi>JSON</mi></mpadded><mtext>sorted</mtext></msub><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">[</mo><mspace width=\"0.1667em\"></mspace><mtext>𝚊𝚜𝚔-𝚝𝚘𝚘𝚕𝚜-𝟽</mtext><mo separator=\"true\">,</mo><mtext> </mtext><mo form=\"prefix\" stretchy=\"false\">{</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>k</mi><mo separator=\"true\">,</mo><mi>h</mi><mo separator=\"true\">,</mo><mtext>store</mtext><mo separator=\"true\">,</mo><mtext>verified</mtext><mo form=\"postfix\" stretchy=\"false\">)</mo><msub><mo form=\"postfix\" stretchy=\"false\">}</mo><mtext>risk, fe</mtext></msub><mo separator=\"true\">,</mo><mtext> </mtext><mo form=\"prefix\" stretchy=\"false\">{</mo><mtext>id</mtext><mrow><mspace width=\"0.2778em\"></mspace><mo>↦</mo><mspace width=\"0.2778em\"></mspace></mrow><mtext>text</mtext><mo form=\"postfix\" stretchy=\"false\">}</mo><mspace width=\"0.1667em\"></mspace><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">]</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.8em\" maxsize=\"1.8em\">)</mo><mi>.</mi></mrow>",
  // \begin{gathered} \mathcal A(F)=\bigl\{\operatorname{round}(|v|,\delta):\ v\in F,\ \delta\in\{0,1,2\}\bigr\},\\ x\approx a\iff|x-a|\le\max\bigl(10^{-12}\max(|x|,|a|),\ 10^{-9}\bigr). \end{gathered}
  allowedSet: "<mtable displaystyle=\"true\" class=\"tml-jot\"><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mi class=\"mathcal\">𝒜</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>F</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>=</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">{</mo><mi>round</mi><mo>⁡</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>|</mi><mi>v</mi><mi>|</mi><mo separator=\"true\">,</mo><mi>δ</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo lspace=\"0.2222em\" rspace=\"0.2222em\">:</mo><mtext> </mtext><mi>v</mi><mo>∈</mo><mi>F</mi><mo separator=\"true\">,</mo><mtext> </mtext><mi>δ</mi><mo>∈</mo><mo form=\"prefix\" stretchy=\"false\">{</mo><mn>0,1,2</mn><mo form=\"postfix\" stretchy=\"false\">}</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">}</mo><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mi>x</mi><mo>≈</mo><mi>a</mi><mspace width=\"0.2778em\"></mspace><mo stretchy=\"false\">⟺</mo><mspace width=\"0.2778em\"></mspace><mi>|</mi><mi>x</mi><mo>−</mo><mi>a</mi><mi>|</mi><mo>≤</mo><mrow><mi>max</mi><mo>⁡</mo></mrow><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">(</mo><msup><mn>10</mn><mrow><mo lspace=\"0em\" rspace=\"0em\">−</mo><mn>12</mn></mrow></msup><mrow><mi>max</mi><mo>⁡</mo></mrow><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>|</mi><mi>x</mi><mi>|</mi><mo separator=\"true\">,</mo><mi>|</mi><mi>a</mi><mi>|</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo separator=\"true\">,</mo><mtext> </mtext><msup><mn>10</mn><mrow><mo lspace=\"0em\" rspace=\"0em\">−</mo><mn>9</mn></mrow></msup><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">)</mo><mi>.</mi></mrow></mtd></mtr></mtable>",
  // \begin{gathered} P_{\text{num}}(\tau):\ \forall x\in\mathcal N(\tau)\ \ \exists a\in\mathcal A(F):\ x\approx a,\\ P_{\text{unit}}(\tau):\ \forall (x,u)\in\mathcal N_U(\tau)\ \ \exists a\in\mathcal A\bigl(\{F_{k(u)}\}\bigr):\ x\approx a. \end{gathered}
  explainNum: "<mtable displaystyle=\"true\" class=\"tml-jot\"><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><msub><mi>P</mi><mtext>num</mtext></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>τ</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo lspace=\"0.2222em\" rspace=\"0.2222em\">:</mo><mtext> </mtext><mi>∀</mi><mi>x</mi><mo>∈</mo><mi class=\"mathcal\">𝒩</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>τ</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mtext> </mtext><mtext> </mtext><mi>∃</mi><mi>a</mi><mo>∈</mo><mi class=\"mathcal\">𝒜</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>F</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo lspace=\"0.2222em\" rspace=\"0.2222em\">:</mo><mtext> </mtext><mi>x</mi><mo>≈</mo><mi>a</mi><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><msub><mi>P</mi><mtext>unit</mtext></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>τ</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo lspace=\"0.2222em\" rspace=\"0.2222em\">:</mo><mtext> </mtext><mi>∀</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>x</mi><mo separator=\"true\">,</mo><mi>u</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>∈</mo><msub><mi class=\"mathcal\">𝒩</mi><mi>U</mi></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>τ</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mtext> </mtext><mtext> </mtext><mi>∃</mi><mi>a</mi><mo>∈</mo><mi class=\"mathcal\">𝒜</mi><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">(</mo><mo form=\"prefix\" stretchy=\"false\">{</mo><msub><mi>F</mi><mrow><mi>k</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>u</mi><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msub><mo form=\"postfix\" stretchy=\"false\">}</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">)</mo><mo lspace=\"0.2222em\" rspace=\"0.2222em\">:</mo><mtext> </mtext><mi>x</mi><mo>≈</mo><mi>a</mi><mi>.</mi></mrow></mtd></mtr></mtable>",
  // \begin{gathered} \mathrm{Accept}_E(\tau)=\bigl[|\operatorname{strip}\tau|>0\bigr]\wedge\bigl[|\tau|\le700\bigr]\wedge P_{\text{num}}(\omega(\tau))\wedge P_{\text{unit}}(\omega(\tau))\\ \wedge\ \neg W_{\#}(\omega(\tau))\wedge\textstyle\bigwedge_{p\in B_E}\neg p(\omega(\tau))\wedge\neg K_E(\omega(\tau)). \end{gathered}
  acceptE: "<mtable displaystyle=\"true\" class=\"tml-jot\"><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><msub><mpadded lspace=\"0\"><mi>Accept</mi></mpadded><mi>E</mi></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>τ</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>=</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">[</mo><mi>|</mi><mspace width=\"0.1667em\"></mspace><mi>strip</mi><mo>⁡</mo><mspace width=\"0.1667em\"></mspace><mi>τ</mi><mi>|</mi><mo>&gt;</mo><mn>0</mn><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">]</mo><mo>∧</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">[</mo><mi>|</mi><mi>τ</mi><mi>|</mi><mo>≤</mo><mn>700</mn><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">]</mo><mo>∧</mo><msub><mi>P</mi><mtext>num</mtext></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>ω</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>τ</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>∧</mo><msub><mi>P</mi><mtext>unit</mtext></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>ω</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>τ</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo form=\"postfix\" stretchy=\"false\">)</mo></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mo>∧</mo><mtext> </mtext><mo form=\"prefix\" stretchy=\"false\">¬</mo><msub><mi>W</mi><mi>#</mi></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>ω</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>τ</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>∧</mo><mstyle scriptlevel=\"0\" displaystyle=\"false\"><msub><mo movablelimits=\"false\">⋀</mo><mrow><mi>p</mi><mo>∈</mo><msub><mi>B</mi><mi>E</mi></msub></mrow></msub><mo form=\"prefix\" stretchy=\"false\">¬</mo><mi>p</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>ω</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>τ</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>∧</mo><mo form=\"prefix\" stretchy=\"false\">¬</mo><msub><mi>K</mi><mi>E</mi></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>ω</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>τ</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo form=\"postfix\" stretchy=\"false\">)</mo><mi>.</mi></mstyle></mrow></mtd></mtr></mtable>",
  // \begin{gathered} P_{\%}=\mathcal R\bigl(A_i,\tilde A,A^{F}_{\min},A^{F}_{\max}\bigr),\qquad P_{\text{N}}=\mathcal R\bigl(M_i,F_{\text{low}},F_{\text{high}},\max_j M_j\bigr),\\ P_{\times}=\mathcal R\bigl(\Phi^{\text{low}},\Phi^{\text{high}}\bigr),\qquad P_{\text{women}}=\mathcal R\bigl(r^{\mathrm{ARF0}},r^{\mathrm{MSF}},n_{F},N\bigr),\qquad P_{\text{kN}}=P_{\text{MPa}}=\varnothing, \end{gathered}
  kindPools: "<mtable displaystyle=\"true\" class=\"tml-jot\"><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><msub><mi>P</mi><mi>%</mi></msub><mo>=</mo><mi class=\"mathcal\">ℛ</mi><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">(</mo><msub><mi>A</mi><mi>i</mi></msub><mo separator=\"true\">,</mo><mover><mi>A</mi><mo stretchy=\"false\" class=\"chr-lrg wbk-lrg\" style=\"math-depth:0;\">~</mo></mover><mo separator=\"true\">,</mo><msubsup><mi>A</mi><mrow><mi>min</mi><mo>⁡</mo></mrow><mi class=\"tml-lrg-pad\">F</mi></msubsup><mo separator=\"true\">,</mo><msubsup><mi>A</mi><mrow><mi>max</mi><mo>⁡</mo></mrow><mi class=\"tml-lrg-pad\">F</mi></msubsup><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">)</mo><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><msub><mi>P</mi><mtext>N</mtext></msub><mo>=</mo><mi class=\"mathcal\">ℛ</mi><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">(</mo><msub><mi>M</mi><mi>i</mi></msub><mo separator=\"true\">,</mo><msub><mi>F</mi><mtext>low</mtext></msub><mo separator=\"true\">,</mo><msub><mi>F</mi><mtext>high</mtext></msub><mo separator=\"true\">,</mo><munder><mi>max</mi><mi>j</mi></munder><mo>⁡</mo><mspace width=\"0.1667em\"></mspace><msub><mi>M</mi><mi>j</mi></msub><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">)</mo><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><msub><mi>P</mi><mo lspace=\"0em\" rspace=\"0em\">×</mo></msub><mo>=</mo><mi class=\"mathcal\">ℛ</mi><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">(</mo><msup><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Φ</mi></mpadded><mtext>low</mtext></msup><mo separator=\"true\">,</mo><msup><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Φ</mi></mpadded><mtext>high</mtext></msup><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">)</mo><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><msub><mi>P</mi><mtext>women</mtext></msub><mo>=</mo><mi class=\"mathcal\">ℛ</mi><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">(</mo><msup><mi>r</mi><mpadded lspace=\"0\" class=\"tml-sml-pad\"><mi>ARF0</mi></mpadded></msup><mo separator=\"true\">,</mo><msup><mi>r</mi><mpadded lspace=\"0\" class=\"tml-sml-pad\"><mi>MSF</mi></mpadded></msup><mo separator=\"true\">,</mo><msub><mi>n</mi><mi>F</mi></msub><mo separator=\"true\">,</mo><mi>N</mi><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">)</mo><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><msub><mi>P</mi><mtext>kN</mtext></msub><mo>=</mo><msub><mi>P</mi><mtext>MPa</mtext></msub><mo>=</mo><mi>⌀</mi><mo separator=\"true\">,</mo></mrow></mtd></mtr></mtable>",
  // \begin{gathered} \mathrm{OK}(x)=\mathrm{TimeOK}(x)\quad\text{if a time unit follows }x;\ \text{otherwise}\\ \mathrm{OK}(x)=\bigl(\exists a\in\mathcal A_R:\ x\approx a\bigr)\wedge\bigl(\kappa(x)\ne\bot\Rightarrow\exists a\in P_{\kappa(x)}:\ x\approx a\bigr), \end{gathered}
  perNumber: "<mtable displaystyle=\"true\" class=\"tml-jot\"><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mpadded lspace=\"0\"><mi>OK</mi></mpadded><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>x</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>=</mo><mpadded lspace=\"0\"><mi>TimeOK</mi></mpadded><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>x</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mspace width=\"1em\"></mspace><mtext>if a time unit follows </mtext><mi>x</mi><mo separator=\"true\">;</mo><mtext> </mtext><mtext>otherwise</mtext></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mpadded lspace=\"0\"><mi>OK</mi></mpadded><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>x</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>=</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">(</mo><mi>∃</mi><mi>a</mi><mo>∈</mo><msub><mi class=\"mathcal\">𝒜</mi><mi>R</mi></msub><mo lspace=\"0.2222em\" rspace=\"0.2222em\">:</mo><mtext> </mtext><mi>x</mi><mo>≈</mo><mi>a</mi><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">)</mo><mo>∧</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">(</mo><mi>κ</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>x</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>≠</mo><mi>⊥</mi><mo stretchy=\"false\">⇒</mo><mi>∃</mi><mi>a</mi><mo>∈</mo><msub><mi>P</mi><mrow><mi>κ</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>x</mi><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msub><mo lspace=\"0.2222em\" rspace=\"0.2222em\">:</mo><mtext> </mtext><mi>x</mi><mo>≈</mo><mi>a</mi><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">)</mo><mo separator=\"true\">,</mo></mrow></mtd></mtr></mtable>",
  // \begin{gathered} \mathrm{TimeOK}(x)=\bigl(u\in\{\text{year},\text{yr},\text{y}\}\wedge\text{written as an age}\wedge x=\text{age}\bigr)\\ \vee\ \bigl(u\in\{\text{day},\text{d}\}\wedge\text{days}\ne\bot\wedge x=\text{days}\bigr). \end{gathered}
  timeOk: "<mtable displaystyle=\"true\" class=\"tml-jot\"><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mpadded lspace=\"0\"><mi>TimeOK</mi></mpadded><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>x</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>=</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">(</mo><mi>u</mi><mo>∈</mo><mo form=\"prefix\" stretchy=\"false\">{</mo><mtext>year</mtext><mo separator=\"true\">,</mo><mtext>yr</mtext><mo separator=\"true\">,</mo><mtext>y</mtext><mo form=\"postfix\" stretchy=\"false\">}</mo><mo>∧</mo><mtext>written as an age</mtext><mo>∧</mo><mi>x</mi><mo>=</mo><mtext>age</mtext><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">)</mo></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mo>∨</mo><mtext> </mtext><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">(</mo><mi>u</mi><mo>∈</mo><mo form=\"prefix\" stretchy=\"false\">{</mo><mtext>day</mtext><mo separator=\"true\">,</mo><mtext>d</mtext><mo form=\"postfix\" stretchy=\"false\">}</mo><mo>∧</mo><mtext>days</mtext><mo>≠</mo><mi>⊥</mi><mo>∧</mo><mi>x</mi><mo>=</mo><mtext>days</mtext><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">)</mo><mi>.</mi></mrow></mtd></mtr></mtable>",
  // \begin{aligned} &\text{“}c\dots\text{than }N\text{”}:&&N=r^{\mathrm{ARF0}}\Rightarrow c\in\{\text{higher, greater, larger, bigger}\},\\ &&&N=r^{\mathrm{MSF}}\Rightarrow c\in\{\text{lower, smaller, less, weaker}\};\\ &\text{“}N\dots\text{women}\dots c\text{”}:&&N=r^{\mathrm{ARF0}}\Rightarrow c\in\{\text{lower, smaller, less}\},\\ &&&N=r^{\mathrm{MSF}}\Rightarrow c\in\{\text{higher, greater, larger, bigger, stronger}\}. \end{aligned}
  rankDir: "<mtable displaystyle=\"true\" class=\"tml-jot\"><mtr><mtd class=\"tml-right\" style=\"padding-left:0em;padding-right:0em;\"><mrow></mrow></mtd><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mrow><mtext>“</mtext><mi>c</mi><mo>…</mo><mtext>than </mtext><mi>N</mi><mtext>”</mtext><mo lspace=\"0.2222em\" rspace=\"0.2222em\">:</mo></mrow></mtd><mtd class=\"tml-right\" style=\"padding-left:1em;padding-right:0em;\"><mrow></mrow></mtd><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mrow><mi>N</mi><mo>=</mo><msup><mi>r</mi><mpadded lspace=\"0\" class=\"tml-sml-pad\"><mi>ARF0</mi></mpadded></msup><mo stretchy=\"false\">⇒</mo><mi>c</mi><mo>∈</mo><mo form=\"prefix\" stretchy=\"false\">{</mo><mtext>higher, greater, larger, bigger</mtext><mo form=\"postfix\" stretchy=\"false\">}</mo><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd class=\"tml-right\" style=\"padding-left:0em;padding-right:0em;\"><mrow></mrow></mtd><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mrow></mrow></mtd><mtd class=\"tml-right\" style=\"padding-left:1em;padding-right:0em;\"><mrow></mrow></mtd><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mrow><mi>N</mi><mo>=</mo><msup><mi>r</mi><mpadded lspace=\"0\" class=\"tml-sml-pad\"><mi>MSF</mi></mpadded></msup><mo stretchy=\"false\">⇒</mo><mi>c</mi><mo>∈</mo><mo form=\"prefix\" stretchy=\"false\">{</mo><mtext>lower, smaller, less, weaker</mtext><mo form=\"postfix\" stretchy=\"false\">}</mo><mo separator=\"true\">;</mo></mrow></mtd></mtr><mtr><mtd class=\"tml-right\" style=\"padding-left:0em;padding-right:0em;\"><mrow></mrow></mtd><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mrow><mtext>“</mtext><mi>N</mi><mo>…</mo><mtext>women</mtext><mo>…</mo><mi>c</mi><mtext>”</mtext><mo lspace=\"0.2222em\" rspace=\"0.2222em\">:</mo></mrow></mtd><mtd class=\"tml-right\" style=\"padding-left:1em;padding-right:0em;\"><mrow></mrow></mtd><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mrow><mi>N</mi><mo>=</mo><msup><mi>r</mi><mpadded lspace=\"0\" class=\"tml-sml-pad\"><mi>ARF0</mi></mpadded></msup><mo stretchy=\"false\">⇒</mo><mi>c</mi><mo>∈</mo><mo form=\"prefix\" stretchy=\"false\">{</mo><mtext>lower, smaller, less</mtext><mo form=\"postfix\" stretchy=\"false\">}</mo><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd class=\"tml-right\" style=\"padding-left:0em;padding-right:0em;\"><mrow></mrow></mtd><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mrow></mrow></mtd><mtd class=\"tml-right\" style=\"padding-left:1em;padding-right:0em;\"><mrow></mrow></mtd><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mrow><mi>N</mi><mo>=</mo><msup><mi>r</mi><mpadded lspace=\"0\" class=\"tml-sml-pad\"><mi>MSF</mi></mpadded></msup><mo stretchy=\"false\">⇒</mo><mi>c</mi><mo>∈</mo><mo form=\"prefix\" stretchy=\"false\">{</mo><mtext>higher, greater, larger, bigger, stronger</mtext><mo form=\"postfix\" stretchy=\"false\">}</mo><mi>.</mi></mrow></mtd></mtr></mtable>",
  // \begin{gathered} \mathrm{Accept}_R(\tau)=\bigl[|\operatorname{strip}\tau|>0\bigr]\wedge\bigl[|\tau|\le600\bigr]\wedge\neg K_R(\tau)\wedge\textstyle\bigwedge_{x\in\mathcal N(\tau')}\mathrm{OK}(x)\wedge D_{\mathrm{ARF0}}(\tau')\\ \wedge\ \neg\,\mathrm{WrongDir}(\tau')\wedge\neg W_{\#}(\tau')\wedge\bigwedge_{p\in T}\neg p(\tau')\wedge\bigwedge_{p\in B_R}\neg p(\tau')\wedge\neg\,\mathrm{Sem}(\tau'). \end{gathered}
  acceptR: "<mtable displaystyle=\"true\" class=\"tml-jot\"><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><msub><mpadded lspace=\"0\"><mi>Accept</mi></mpadded><mi>R</mi></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>τ</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>=</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">[</mo><mi>|</mi><mspace width=\"0.1667em\"></mspace><mi>strip</mi><mo>⁡</mo><mspace width=\"0.1667em\"></mspace><mi>τ</mi><mi>|</mi><mo>&gt;</mo><mn>0</mn><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">]</mo><mo>∧</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">[</mo><mi>|</mi><mi>τ</mi><mi>|</mi><mo>≤</mo><mn>600</mn><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">]</mo><mo>∧</mo><mo form=\"prefix\" stretchy=\"false\">¬</mo><msub><mi>K</mi><mi>R</mi></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>τ</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>∧</mo><mstyle scriptlevel=\"0\" displaystyle=\"false\"><msub><mo movablelimits=\"false\">⋀</mo><mrow><mi>x</mi><mo>∈</mo><mi class=\"mathcal\">𝒩</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><msup><mi>τ</mi><mo lspace=\"0em\" rspace=\"0em\" class=\"tml-prime\">′</mo></msup><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msub><mpadded lspace=\"0\"><mi>OK</mi></mpadded><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>x</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>∧</mo><msub><mi>D</mi><mpadded lspace=\"0\"><mi>ARF0</mi></mpadded></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><msup><mi>τ</mi><mo lspace=\"0em\" rspace=\"0em\" class=\"tml-prime\">′</mo></msup><mo form=\"postfix\" stretchy=\"false\">)</mo></mstyle></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mo>∧</mo><mtext> </mtext><mo form=\"prefix\" stretchy=\"false\">¬</mo><mspace width=\"0.1667em\"></mspace><mpadded lspace=\"0\"><mi>WrongDir</mi></mpadded><mo form=\"prefix\" stretchy=\"false\">(</mo><msup><mi>τ</mi><mo lspace=\"0em\" rspace=\"0em\" class=\"tml-prime\">′</mo></msup><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>∧</mo><mo form=\"prefix\" stretchy=\"false\">¬</mo><msub><mi>W</mi><mi>#</mi></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><msup><mi>τ</mi><mo lspace=\"0em\" rspace=\"0em\" class=\"tml-prime\">′</mo></msup><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>∧</mo><mrow><munder><mo movablelimits=\"false\">⋀</mo><mrow><mi>p</mi><mo>∈</mo><mi>T</mi></mrow></munder></mrow><mo form=\"prefix\" stretchy=\"false\">¬</mo><mi>p</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><msup><mi>τ</mi><mo lspace=\"0em\" rspace=\"0em\" class=\"tml-prime\">′</mo></msup><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>∧</mo><mrow><munder><mo movablelimits=\"false\">⋀</mo><mrow><mi>p</mi><mo>∈</mo><msub><mi>B</mi><mi>R</mi></msub></mrow></munder></mrow><mo form=\"prefix\" stretchy=\"false\">¬</mo><mi>p</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><msup><mi>τ</mi><mo lspace=\"0em\" rspace=\"0em\" class=\"tml-prime\">′</mo></msup><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>∧</mo><mo form=\"prefix\" stretchy=\"false\">¬</mo><mspace width=\"0.1667em\"></mspace><mpadded lspace=\"0\"><mi>Sem</mi></mpadded><mo form=\"prefix\" stretchy=\"false\">(</mo><msup><mi>τ</mi><mo lspace=\"0em\" rspace=\"0em\" class=\"tml-prime\">′</mo></msup><mo form=\"postfix\" stretchy=\"false\">)</mo><mi>.</mi></mrow></mtd></mtr></mtable>",
  // \begin{gathered} u(m)\leftarrow t_{\text{fail}}+\begin{cases}300\ \text{s} & s=429,\\ 60\ \text{s} & \text{any other failure,}\end{cases}\\ \mathrm{skip}(m,t)\iff t<u(m)\ \vee\ \forall k\in K:\ t<u(k,m), \end{gathered}
  cooldown: "<mtable displaystyle=\"true\" class=\"tml-jot\"><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mi>u</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>m</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo stretchy=\"false\">←</mo><msub><mi>t</mi><mtext>fail</mtext></msub><mo>+</mo><mrow><mo fence=\"true\" form=\"prefix\">{</mo><mtable><mtr><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mrow><mn>300</mn><mtext> </mtext><mtext>s</mtext></mrow></mtd><mtd class=\"tml-left\" style=\"padding-left:1em;padding-right:0em;\"><mrow><mi>s</mi><mo>=</mo><mn>429</mn><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mrow><mn>60</mn><mtext> </mtext><mtext>s</mtext></mrow></mtd><mtd class=\"tml-left\" style=\"padding-left:1em;padding-right:0em;\"><mtext>any other failure,</mtext></mtd></mtr></mtable><mo fence=\"true\" form=\"postfix\"></mo></mrow></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mpadded lspace=\"0\"><mi>skip</mi></mpadded><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>m</mi><mo separator=\"true\">,</mo><mi>t</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mspace width=\"0.2778em\"></mspace><mo stretchy=\"false\">⟺</mo><mspace width=\"0.2778em\"></mspace><mi>t</mi><mo>&lt;</mo><mi>u</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>m</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mtext> </mtext><mo>∨</mo><mtext> </mtext><mi>∀</mi><mi>k</mi><mo>∈</mo><mi>K</mi><mo lspace=\"0.2222em\" rspace=\"0.2222em\">:</mo><mtext> </mtext><mi>t</mi><mo>&lt;</mo><mi>u</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>k</mi><mo separator=\"true\">,</mo><mi>m</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo separator=\"true\">,</mo></mrow></mtd></mtr></mtable>",
  // \begin{gathered} s\in\{400,401,403\}\ \Rightarrow\ u(k,m)\leftarrow t+60\ \text{s},\ \ k\leftarrow\operatorname{next}(K),\\ s\notin\{400,401,403\}\ (\text{including }429)\ \Rightarrow\ \text{stop model }m. \end{gathered}
  keyFailover: "<mtable displaystyle=\"true\" class=\"tml-jot\"><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mi>s</mi><mo>∈</mo><mo form=\"prefix\" stretchy=\"false\">{</mo><mn>400,401,403</mn><mo form=\"postfix\" stretchy=\"false\">}</mo><mtext> </mtext><mo stretchy=\"false\">⇒</mo><mtext> </mtext><mi>u</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>k</mi><mo separator=\"true\">,</mo><mi>m</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo stretchy=\"false\">←</mo><mi>t</mi><mo>+</mo><mn>60</mn><mtext> </mtext><mtext>s</mtext><mo separator=\"true\">,</mo><mtext> </mtext><mtext> </mtext><mi>k</mi><mo stretchy=\"false\">←</mo><mi>next</mi><mo>⁡</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>K</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mi>s</mi><mo>∉</mo><mo form=\"prefix\" stretchy=\"false\">{</mo><mn>400,401,403</mn><mo form=\"postfix\" stretchy=\"false\">}</mo><mtext> </mtext><mo form=\"prefix\" stretchy=\"false\">(</mo><mtext>including </mtext><mn>429</mn><mo form=\"postfix\" stretchy=\"false\">)</mo><mtext> </mtext><mo stretchy=\"false\">⇒</mo><mtext> </mtext><mtext>stop model </mtext><mi>m</mi><mi>.</mi></mrow></mtd></mtr></mtable>",
  // \begin{gathered} T(a)=\min\bigl(T_p,\ T_s,\ T_\ell\bigr),\qquad T_p=\begin{cases}3600\ \text{s} & \text{Gemini},\\ 60\ \text{s} & \text{Groq or template},\end{cases}\\ T_s=60\ \text{s}\ \text{if served saved, else }\infty,\\ T_\ell=60\ \text{s}\ \text{if a database is set but no row was written, else }\infty. \end{gathered}
  lifetime: "<mtable displaystyle=\"true\" class=\"tml-jot\"><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mi>T</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>a</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>=</mo><mrow><mi>min</mi><mo>⁡</mo></mrow><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">(</mo><msub><mi>T</mi><mi>p</mi></msub><mo separator=\"true\">,</mo><mtext> </mtext><msub><mi>T</mi><mi>s</mi></msub><mo separator=\"true\">,</mo><mtext> </mtext><msub><mi>T</mi><mi>ℓ</mi></msub><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">)</mo><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><msub><mi>T</mi><mi>p</mi></msub><mo>=</mo><mrow><mo fence=\"true\" form=\"prefix\">{</mo><mtable><mtr><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mrow><mn>3600</mn><mtext> </mtext><mtext>s</mtext></mrow></mtd><mtd class=\"tml-left\" style=\"padding-left:1em;padding-right:0em;\"><mrow><mtext>Gemini</mtext><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mrow><mn>60</mn><mtext> </mtext><mtext>s</mtext></mrow></mtd><mtd class=\"tml-left\" style=\"padding-left:1em;padding-right:0em;\"><mrow><mtext>Groq or template</mtext><mo separator=\"true\">,</mo></mrow></mtd></mtr></mtable><mo fence=\"true\" form=\"postfix\"></mo></mrow></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><msub><mi>T</mi><mi>s</mi></msub><mo>=</mo><mn>60</mn><mtext> </mtext><mtext>s</mtext><mtext> </mtext><mtext>if served saved, else </mtext><mi>∞</mi><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><msub><mi>T</mi><mi>ℓ</mi></msub><mo>=</mo><mn>60</mn><mtext> </mtext><mtext>s</mtext><mtext> </mtext><mtext>if a database is set but no row was written, else </mtext><mi>∞</mi><mi>.</mi></mrow></mtd></mtr></mtable>",
  // \begin{gathered} \delta(\text{START})=\text{triage},\quad\delta(\text{triage})=\text{evidence},\quad\delta(\text{evidence})=\text{writer},\\ \delta(\text{writer})=\text{critic},\quad\delta(\text{critic})\in\{\text{writer},\text{audit}\},\quad\delta(\text{audit})=\text{END}, \end{gathered}
  delta: "<mtable displaystyle=\"true\" class=\"tml-jot\"><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mi>δ</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mtext>START</mtext><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>=</mo><mtext>triage</mtext><mo separator=\"true\">,</mo><mspace width=\"1em\"></mspace><mi>δ</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mtext>triage</mtext><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>=</mo><mtext>evidence</mtext><mo separator=\"true\">,</mo><mspace width=\"1em\"></mspace><mi>δ</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mtext>evidence</mtext><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>=</mo><mtext>writer</mtext><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mi>δ</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mtext>writer</mtext><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>=</mo><mtext>critic</mtext><mo separator=\"true\">,</mo><mspace width=\"1em\"></mspace><mi>δ</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mtext>critic</mtext><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>∈</mo><mo form=\"prefix\" stretchy=\"false\">{</mo><mtext>writer</mtext><mo separator=\"true\">,</mo><mtext>audit</mtext><mo form=\"postfix\" stretchy=\"false\">}</mo><mo separator=\"true\">,</mo><mspace width=\"1em\"></mspace><mi>δ</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mtext>audit</mtext><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>=</mo><mtext>END</mtext><mo separator=\"true\">,</mo></mrow></mtd></mtr></mtable>",
  // \delta(\text{critic})=\begin{cases} \text{audit} & s\ne\bot\ \wedge\ \mathrm{Accept}_A(s),\\ \text{error (the request raises)} & s\ne\bot\ \wedge\ \neg\,\mathrm{Accept}_A(s),\\ \text{writer (rewrite)} & s=\bot\ \wedge\ \text{rejected}\ \wedge\ \neg\,\text{rewritten}\ \wedge\ t_{\text{rem}}>0,\\ \text{writer}\ (p\leftarrow p+1) & s=\bot\ \text{otherwise.} \end{cases}
  criticRoute: "<mrow><mi>δ</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mtext>critic</mtext><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>=</mo><mrow><mo fence=\"true\" form=\"prefix\">{</mo><mtable><mtr><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mtext>audit</mtext></mtd><mtd class=\"tml-left\" style=\"padding-left:1em;padding-right:0em;\"><mrow><mi>s</mi><mo>≠</mo><mi>⊥</mi><mtext> </mtext><mo>∧</mo><mtext> </mtext><msub><mpadded lspace=\"0\"><mi>Accept</mi></mpadded><mi>A</mi></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>s</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mtext>error (the request raises)</mtext></mtd><mtd class=\"tml-left\" style=\"padding-left:1em;padding-right:0em;\"><mrow><mi>s</mi><mo>≠</mo><mi>⊥</mi><mtext> </mtext><mo>∧</mo><mtext> </mtext><mo form=\"prefix\" stretchy=\"false\">¬</mo><mspace width=\"0.1667em\"></mspace><msub><mpadded lspace=\"0\"><mi>Accept</mi></mpadded><mi>A</mi></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>s</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mtext>writer (rewrite)</mtext></mtd><mtd class=\"tml-left\" style=\"padding-left:1em;padding-right:0em;\"><mrow><mi>s</mi><mo>=</mo><mi>⊥</mi><mtext> </mtext><mo>∧</mo><mtext> </mtext><mtext>rejected</mtext><mtext> </mtext><mo>∧</mo><mtext> </mtext><mo form=\"prefix\" stretchy=\"false\">¬</mo><mspace width=\"0.1667em\"></mspace><mtext>rewritten</mtext><mtext> </mtext><mo>∧</mo><mtext> </mtext><msub><mi>t</mi><mtext>rem</mtext></msub><mo>&gt;</mo><mn>0</mn><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mrow><mtext>writer</mtext><mtext> </mtext><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>p</mi><mo stretchy=\"false\">←</mo><mi>p</mi><mo>+</mo><mn>1</mn><mo form=\"postfix\" stretchy=\"false\">)</mo></mrow></mtd><mtd class=\"tml-left\" style=\"padding-left:1em;padding-right:0em;\"><mrow><mi>s</mi><mo>=</mo><mi>⊥</mi><mtext> </mtext><mtext>otherwise.</mtext></mrow></mtd></mtr></mtable><mo fence=\"true\" form=\"postfix\"></mo></mrow></mrow>",
  // \begin{gathered} \mathrm{Valid}(C)\iff1\le|C|\le4\ \wedge\ C\ \text{has no duplicates}\ \wedge\ \forall c\in C:\\ c.\text{name}\in\mathcal T\ \wedge\ \operatorname{dom}(c.\text{args})=\operatorname{dom}\bigl(\mathcal T[c.\text{name}]\bigr)\ \wedge\ \forall j:\ c.\text{args}[j]\in\mathcal T[c.\text{name}][j], \end{gathered}
  planValid: "<mtable displaystyle=\"true\" class=\"tml-jot\"><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mpadded lspace=\"0\"><mi>Valid</mi></mpadded><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>C</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mspace width=\"0.2778em\"></mspace><mo stretchy=\"false\">⟺</mo><mspace width=\"0.2778em\"></mspace><mn>1</mn><mo>≤</mo><mi>|</mi><mi>C</mi><mi>|</mi><mo>≤</mo><mn>4</mn><mtext> </mtext><mo>∧</mo><mtext> </mtext><mi>C</mi><mtext> </mtext><mtext>has no duplicates</mtext><mtext> </mtext><mo>∧</mo><mtext> </mtext><mi>∀</mi><mi>c</mi><mo>∈</mo><mi>C</mi><mo lspace=\"0.2222em\" rspace=\"0.2222em\">:</mo></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mi>c</mi><mi>.</mi><mtext>name</mtext><mo>∈</mo><mi class=\"mathcal\">𝒯</mi><mtext> </mtext><mo>∧</mo><mtext> </mtext><mi>dom</mi><mo>⁡</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>c</mi><mi>.</mi><mtext>args</mtext><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>=</mo><mi>dom</mi><mo>⁡</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">(</mo><mi class=\"mathcal\">𝒯</mi><mo form=\"prefix\" stretchy=\"false\">[</mo><mi>c</mi><mi>.</mi><mtext>name</mtext><mo form=\"postfix\" stretchy=\"false\">]</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">)</mo><mtext> </mtext><mo>∧</mo><mtext> </mtext><mi>∀</mi><mi>j</mi><mo lspace=\"0.2222em\" rspace=\"0.2222em\">:</mo><mtext> </mtext><mi>c</mi><mi>.</mi><mtext>args</mtext><mo form=\"prefix\" stretchy=\"false\">[</mo><mi>j</mi><mo form=\"postfix\" stretchy=\"false\">]</mo><mo>∈</mo><mi class=\"mathcal\">𝒯</mi><mo form=\"prefix\" stretchy=\"false\">[</mo><mi>c</mi><mi>.</mi><mtext>name</mtext><mo form=\"postfix\" stretchy=\"false\">]</mo><mo form=\"prefix\" stretchy=\"false\">[</mo><mi>j</mi><mo form=\"postfix\" stretchy=\"false\">]</mo><mo separator=\"true\">,</mo></mrow></mtd></mtr></mtable>",
  // \begin{gathered} \mathrm{Accept}_A(s)=s\in\mathcal L\bigl(\texttt{\textbackslash s*[a-z][a-z0-9\_]*(\textbackslash s*,\textbackslash s*[a-z][a-z0-9\_]*)*\textbackslash s*}\bigr)\\ \wedge\ 1\le|I|\le3\wedge|\operatorname{set}(I)|=|I|\wedge I\subseteq S_{\text{allowed}}\\ \wedge\ (\texttt{unavailable}\in I\Rightarrow|I|=1)\wedge\operatorname{words}(\rho(I))\le120\\ \wedge\ \operatorname{cites}(\rho(I))\subseteq\mathcal S\wedge\operatorname{links}(\rho(I))\subseteq\mathcal P\wedge R\subseteq I. \end{gathered}
  acceptA: "<mtable displaystyle=\"true\" class=\"tml-jot\"><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><msub><mpadded lspace=\"0\"><mi>Accept</mi></mpadded><mi>A</mi></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>s</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>=</mo><mi>s</mi><mo>∈</mo><mi class=\"mathcal\">ℒ</mi><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">(</mo><mtext>\\𝚜*[𝚊-𝚣][𝚊-𝚣𝟶-𝟿_]*(\\𝚜*,\\𝚜*[𝚊-𝚣][𝚊-𝚣𝟶-𝟿_]*)*\\𝚜*</mtext><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">)</mo></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mo>∧</mo><mtext> </mtext><mn>1</mn><mo>≤</mo><mi>|</mi><mi>I</mi><mi>|</mi><mo>≤</mo><mn>3</mn><mo>∧</mo><mi>|</mi><mspace width=\"0.1667em\"></mspace><mi>set</mi><mo>⁡</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>I</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mi>|</mi><mo>=</mo><mi>|</mi><mi>I</mi><mi>|</mi><mo>∧</mo><mi>I</mi><mo>⊆</mo><msub><mi>S</mi><mtext>allowed</mtext></msub></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mo>∧</mo><mtext> </mtext><mo form=\"prefix\" stretchy=\"false\">(</mo><mtext>𝚞𝚗𝚊𝚟𝚊𝚒𝚕𝚊𝚋𝚕𝚎</mtext><mo>∈</mo><mi>I</mi><mo stretchy=\"false\">⇒</mo><mi>|</mi><mi>I</mi><mi>|</mi><mo>=</mo><mn>1</mn><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>∧</mo><mi>words</mi><mo>⁡</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>ρ</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>I</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>≤</mo><mn>120</mn></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mo>∧</mo><mtext> </mtext><mi>cites</mi><mo>⁡</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>ρ</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>I</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>⊆</mo><mi class=\"mathcal\">𝒮</mi><mo>∧</mo><mi>links</mi><mo>⁡</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>ρ</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>I</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>⊆</mo><mi class=\"mathcal\">𝒫</mi><mo>∧</mo><mi>R</mi><mo>⊆</mo><mi>I</mi><mi>.</mi></mrow></mtd></mtr></mtable>",
  // \rho(I)=\operatorname{text}(i_1)\,\Vert\,\cdots\,\Vert\,\operatorname{text}(i_{|I|})\,\Vert\,\text{DISCLAIMER},
  render: "<mrow><mi>ρ</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>I</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>=</mo><mi>text</mi><mo>⁡</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><msub><mi>i</mi><mn>1</mn></msub><mo form=\"postfix\" stretchy=\"false\">)</mo><mspace width=\"0.1667em\"></mspace><mi>‖</mi><mspace width=\"0.1667em\"></mspace><mo>⋯</mo><mspace width=\"0.1667em\"></mspace><mi>‖</mi><mspace width=\"0.1667em\"></mspace><mspace width=\"0.1667em\"></mspace><mi>text</mi><mo>⁡</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><msub><mi>i</mi><mrow><mi>|</mi><mi>I</mi><mi>|</mi></mrow></msub><mo form=\"postfix\" stretchy=\"false\">)</mo><mspace width=\"0.1667em\"></mspace><mi>‖</mi><mspace width=\"0.1667em\"></mspace><mtext>DISCLAIMER</mtext><mo separator=\"true\">,</mo></mrow>",
  // R=\begin{cases} I_{\text{rule}} & \texttt{prediction\_limit}\in I_{\text{rule}},\\ I_{\text{rule}} & \operatorname{set}(I_{\text{rule}})=\{\texttt{arf0\_rank},\texttt{strength}\},\\ \{I_{\text{rule}}[0]\} & I_{\text{rule}}\ne\varnothing,\\ \varnothing & \text{otherwise.} \end{cases}
  required: "<mrow><mi>R</mi><mo>=</mo><mrow><mo fence=\"true\" form=\"prefix\">{</mo><mtable><mtr><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><msub><mi>I</mi><mtext>rule</mtext></msub></mtd><mtd class=\"tml-left\" style=\"padding-left:1em;padding-right:0em;\"><mrow><mtext>𝚙𝚛𝚎𝚍𝚒𝚌𝚝𝚒𝚘𝚗_𝚕𝚒𝚖𝚒𝚝</mtext><mo>∈</mo><msub><mi>I</mi><mtext>rule</mtext></msub><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><msub><mi>I</mi><mtext>rule</mtext></msub></mtd><mtd class=\"tml-left\" style=\"padding-left:1em;padding-right:0em;\"><mrow><mi>set</mi><mo>⁡</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><msub><mi>I</mi><mtext>rule</mtext></msub><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>=</mo><mo form=\"prefix\" stretchy=\"false\">{</mo><mtext>𝚊𝚛𝚏𝟶_𝚛𝚊𝚗𝚔</mtext><mo separator=\"true\">,</mo><mtext>𝚜𝚝𝚛𝚎𝚗𝚐𝚝𝚑</mtext><mo form=\"postfix\" stretchy=\"false\">}</mo><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mrow><mo form=\"prefix\" stretchy=\"false\">{</mo><msub><mi>I</mi><mtext>rule</mtext></msub><mo form=\"prefix\" stretchy=\"false\">[</mo><mn>0</mn><mo form=\"postfix\" stretchy=\"false\">]</mo><mo form=\"postfix\" stretchy=\"false\">}</mo></mrow></mtd><mtd class=\"tml-left\" style=\"padding-left:1em;padding-right:0em;\"><mrow><msub><mi>I</mi><mtext>rule</mtext></msub><mo>≠</mo><mi>⌀</mi><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mi>⌀</mi></mtd><mtd class=\"tml-left\" style=\"padding-left:1em;padding-right:0em;\"><mtext>otherwise.</mtext></mtd></mtr></mtable><mo fence=\"true\" form=\"postfix\"></mo></mrow></mrow>",
  // \begin{gathered} \mathrm{admit}(c,t)\iff\bigl|\{h\in H_c:\ h>t-60\}\bigr|<8,\\ \text{Retry-After}=\max\bigl(1,\ \lceil h_0+60-t\rceil\bigr), \end{gathered}
  admission: "<mtable displaystyle=\"true\" class=\"tml-jot\"><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mpadded lspace=\"0\"><mi>admit</mi></mpadded><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>c</mi><mo separator=\"true\">,</mo><mi>t</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mspace width=\"0.2778em\"></mspace><mo stretchy=\"false\">⟺</mo><mspace width=\"0.2778em\"></mspace><mo fence=\"true\" stretchy=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">|</mo><mo form=\"prefix\" stretchy=\"false\">{</mo><mi>h</mi><mo>∈</mo><msub><mi>H</mi><mi>c</mi></msub><mo lspace=\"0.2222em\" rspace=\"0.2222em\">:</mo><mtext> </mtext><mi>h</mi><mo>&gt;</mo><mi>t</mi><mo>−</mo><mn>60</mn><mo form=\"postfix\" stretchy=\"false\">}</mo><mo fence=\"true\" stretchy=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">|</mo><mo>&lt;</mo><mn>8</mn><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mtext>Retry-After</mtext><mo>=</mo><mrow><mi>max</mi><mo>⁡</mo></mrow><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">(</mo><mn>1</mn><mo separator=\"true\">,</mo><mtext> </mtext><mo form=\"prefix\" stretchy=\"false\">⌈</mo><msub><mi>h</mi><mn>0</mn></msub><mo>+</mo><mn>60</mn><mo>−</mo><mi>t</mi><mo form=\"postfix\" stretchy=\"false\">⌉</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">)</mo><mo separator=\"true\">,</mo></mrow></mtd></mtr></mtable>",
  // \begin{gathered} \text{row}=\bigl(t,\ \text{uuid},\ \text{endpoint},\ \text{case},\ p,\ m,\ \operatorname{SHA256}(\text{facts}),\ \operatorname{SHA256}(\text{text}),\\ \Delta t_{\text{ms}},\ \text{store},\ [(p_j,\text{category}_j)]_j,\ [\text{tool}_k]_{k\le4}\bigr). \end{gathered}
  auditRow: "<mtable displaystyle=\"true\" class=\"tml-jot\"><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mtext>row</mtext><mo>=</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">(</mo><mi>t</mi><mo separator=\"true\">,</mo><mtext> </mtext><mtext>uuid</mtext><mo separator=\"true\">,</mo><mtext> </mtext><mtext>endpoint</mtext><mo separator=\"true\">,</mo><mtext> </mtext><mtext>case</mtext><mo separator=\"true\">,</mo><mtext> </mtext><mi>p</mi><mo separator=\"true\">,</mo><mtext> </mtext><mi>m</mi><mo separator=\"true\">,</mo><mtext> </mtext><mi>SHA256</mi><mo>⁡</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><mtext>facts</mtext><mo form=\"postfix\" stretchy=\"false\">)</mo><mo separator=\"true\">,</mo><mtext> </mtext><mi>SHA256</mi><mo>⁡</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><mtext>text</mtext><mo form=\"postfix\" stretchy=\"false\">)</mo><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Δ</mi></mpadded><msub><mi>t</mi><mtext>ms</mtext></msub><mo separator=\"true\">,</mo><mtext> </mtext><mtext>store</mtext><mo separator=\"true\">,</mo><mtext> </mtext><mo form=\"prefix\" stretchy=\"false\">[</mo><mo form=\"prefix\" stretchy=\"false\">(</mo><msub><mi>p</mi><mi>j</mi></msub><mo separator=\"true\">,</mo><msub><mtext>category</mtext><mi>j</mi></msub><mo form=\"postfix\" stretchy=\"false\">)</mo><msub><mo form=\"postfix\" stretchy=\"false\">]</mo><mi>j</mi></msub><mo separator=\"true\">,</mo><mtext> </mtext><mo form=\"prefix\" stretchy=\"false\">[</mo><msub><mtext>tool</mtext><mi>k</mi></msub><msub><mo form=\"postfix\" stretchy=\"false\">]</mo><mrow><mi>k</mi><mo>≤</mo><mn>4</mn></mrow></msub><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">)</mo><mi>.</mi></mrow></mtd></mtr></mtable>",
  // \mathrm{audit\_ok}(q)\iff\text{row}_{\text{logged.id}(q)}.\text{text\_sha256}=\operatorname{SHA256}\bigl(\text{answer}(q)\bigr).
  auditCheck: "<mrow><mrow><mpadded lspace=\"0\"><mi mathvariant=\"normal\">a</mi></mpadded><mpadded lspace=\"0\"><mi mathvariant=\"normal\">u</mi></mpadded><mpadded lspace=\"0\"><mi mathvariant=\"normal\">d</mi></mpadded><mpadded lspace=\"0\"><mi mathvariant=\"normal\">i</mi></mpadded><mpadded lspace=\"0\"><mi mathvariant=\"normal\">t</mi></mpadded><mi>_</mi><mpadded lspace=\"0\"><mi mathvariant=\"normal\">o</mi></mpadded><mpadded lspace=\"0\"><mi mathvariant=\"normal\">k</mi></mpadded></mrow><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>q</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mspace width=\"0.2778em\"></mspace><mo stretchy=\"false\">⟺</mo><mspace width=\"0.2778em\"></mspace><msub><mtext>row</mtext><mrow><mtext>logged.id</mtext><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>q</mi><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msub><mi>.</mi><mtext>text_sha256</mtext><mo>=</mo><mi>SHA256</mi><mo>⁡</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">(</mo><mtext>answer</mtext><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>q</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">)</mo><mi>.</mi></mrow>",
  // \begin{gathered} C_k=\{c\in\text{calls}:c.u_k\ne\bot\},\\ \text{total}_k=\begin{cases} 0 & \text{calls}=\varnothing\ \wedge\ \text{reasons}=\varnothing,\\ \sum_{c\in C_k}c.u_k & C_k\ne\varnothing,\\ \bot & \text{otherwise,} \end{cases}\\ \text{complete}\iff\text{reasons}=\varnothing. \end{gathered}
  tokens: "<mtable displaystyle=\"true\" class=\"tml-jot\"><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><msub><mi>C</mi><mi>k</mi></msub><mo>=</mo><mo form=\"prefix\" stretchy=\"false\">{</mo><mi>c</mi><mo>∈</mo><mtext>calls</mtext><mo lspace=\"0.2222em\" rspace=\"0.2222em\">:</mo><mi>c</mi><mi>.</mi><msub><mi>u</mi><mi>k</mi></msub><mo>≠</mo><mi>⊥</mi><mo form=\"postfix\" stretchy=\"false\">}</mo><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><msub><mtext>total</mtext><mi>k</mi></msub><mo>=</mo><mrow><mo fence=\"true\" form=\"prefix\">{</mo><mtable><mtr><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mn>0</mn></mtd><mtd class=\"tml-left\" style=\"padding-left:1em;padding-right:0em;\"><mrow><mtext>calls</mtext><mo>=</mo><mi>⌀</mi><mtext> </mtext><mo>∧</mo><mtext> </mtext><mtext>reasons</mtext><mo>=</mo><mi>⌀</mi><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mrow><msub><mo movablelimits=\"false\">∑</mo><mrow><mi>c</mi><mo>∈</mo><msub><mi>C</mi><mi>k</mi></msub></mrow></msub><mi>c</mi><mi>.</mi><msub><mi>u</mi><mi>k</mi></msub></mrow></mtd><mtd class=\"tml-left\" style=\"padding-left:1em;padding-right:0em;\"><mrow><msub><mi>C</mi><mi>k</mi></msub><mo>≠</mo><mi>⌀</mi><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mi>⊥</mi></mtd><mtd class=\"tml-left\" style=\"padding-left:1em;padding-right:0em;\"><mtext>otherwise,</mtext></mtd></mtr></mtable><mo fence=\"true\" form=\"postfix\"></mo></mrow></mrow></mtd></mtr><mtr><mtd style=\"padding-left:0em;padding-right:0em;\"><mrow><mtext>complete</mtext><mspace width=\"0.2778em\"></mspace><mo stretchy=\"false\">⟺</mo><mspace width=\"0.2778em\"></mspace><mtext>reasons</mtext><mo>=</mo><mi>⌀</mi><mi>.</mi></mrow></mtd></mtr></mtable>",
  // \sigma=\frac{F}{A}=\frac{90\ \text{N}}{9\ \text{mm}^2}=10\ \text{MPa},\qquad \delta=\frac{FL}{EA}=\frac{90\cdot6}{1000\cdot9}=0.06\ \text{mm},
  bar: "<mrow><mi>σ</mi><mo>=</mo><mfrac><mi>F</mi><mi>A</mi></mfrac><mo>=</mo><mfrac><mrow><mn>90</mn><mtext> </mtext><mtext>N</mtext></mrow><mrow><mn>9</mn><mtext> </mtext><msup><mtext>mm</mtext><mn>2</mn></msup></mrow></mfrac><mo>=</mo><mn>10</mn><mtext> </mtext><mtext>MPa</mtext><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><mi>δ</mi><mo>=</mo><mfrac><mrow><mi>F</mi><mi>L</mi></mrow><mrow><mi>E</mi><mi>A</mi></mrow></mfrac><mo>=</mo><mfrac><mrow><mn>90</mn><mo>⋅</mo><mn>6</mn></mrow><mrow><mn>1000</mn><mo>⋅</mo><mn>9</mn></mrow></mfrac><mo>=</mo><mn>0.06</mn><mtext> </mtext><mtext>mm</mtext><mo separator=\"true\">,</mo></mrow>",
  // \delta=\sigma\left(\frac{L_1}{E_1}+\frac{L_2}{E_2}\right)=10\left(\frac{3}{1000}+\frac{3}{3000}\right)=0.04\ \text{mm}.
  seriesBar: "<mrow><mi>δ</mi><mo>=</mo><mi>σ</mi><mrow><mo fence=\"true\" form=\"prefix\">(</mo><mfrac><msub><mi>L</mi><mn>1</mn></msub><msub><mi>E</mi><mn>1</mn></msub></mfrac><mo>+</mo><mfrac><msub><mi>L</mi><mn>2</mn></msub><msub><mi>E</mi><mn>2</mn></msub></mfrac><mo fence=\"true\" form=\"postfix\">)</mo></mrow><mo>=</mo><mn>10</mn><mrow><mo fence=\"true\" form=\"prefix\">(</mo><mfrac><mn>3</mn><mn>1000</mn></mfrac><mo>+</mo><mfrac><mn>3</mn><mn>3000</mn></mfrac><mo fence=\"true\" form=\"postfix\">)</mo></mrow><mo>=</mo><mn>0.04</mn><mtext> </mtext><mtext>mm</mtext><mi>.</mi></mrow>",
  // D(A,B)=\frac{2\,|A\cap B|}{|A|+|B|},\qquad D_{\text{sacrum+S1}}=D\bigl(M_{\text{sacrum}}\cup M_{\text{S1}},\ \{\text{expert}=1\}\bigr),
  dice: "<mrow><mi>D</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>A</mi><mo separator=\"true\">,</mo><mi>B</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>=</mo><mfrac><mrow><mn>2</mn><mspace width=\"0.1667em\"></mspace><mi>|</mi><mi>A</mi><mo>∩</mo><mi>B</mi><mi>|</mi></mrow><mrow><mi>|</mi><mi>A</mi><mi>|</mi><mo>+</mo><mi>|</mi><mi>B</mi><mi>|</mi></mrow></mfrac><mo separator=\"true\">,</mo><mspace width=\"2em\"></mspace><msub><mi>D</mi><mtext>sacrum+S1</mtext></msub><mo>=</mo><mi>D</mi><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">(</mo><msub><mi>M</mi><mtext>sacrum</mtext></msub><mo>∪</mo><msub><mi>M</mi><mtext>S1</mtext></msub><mo separator=\"true\">,</mo><mtext> </mtext><mo form=\"prefix\" stretchy=\"false\">{</mo><mtext>expert</mtext><mo>=</mo><mn>1</mn><mo form=\"postfix\" stretchy=\"false\">}</mo><mo fence=\"true\" symmetric=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">)</mo><mo separator=\"true\">,</mo></mrow>",
  // \mathrm{verdict}(q)=\begin{cases}\text{ERROR} & \text{status}(q)\ne200\ \vee\ \text{answer}(q)\text{ empty},\\ \text{PASS} & \bigwedge_{i=1}^{9}\mathrm{check}_i(q),\\ \text{FAIL} & \text{otherwise,}\end{cases}
  verdict: "<mrow><mpadded lspace=\"0\"><mi>verdict</mi></mpadded><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>q</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>=</mo><mrow><mo fence=\"true\" form=\"prefix\">{</mo><mtable><mtr><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mtext>ERROR</mtext></mtd><mtd class=\"tml-left\" style=\"padding-left:1em;padding-right:0em;\"><mrow><mtext>status</mtext><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>q</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>≠</mo><mn>200</mn><mtext> </mtext><mo>∨</mo><mtext> </mtext><mtext>answer</mtext><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>q</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mtext> empty</mtext><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mtext>PASS</mtext></mtd><mtd class=\"tml-left\" style=\"padding-left:1em;padding-right:0em;\"><mrow><msubsup><mo movablelimits=\"false\">⋀</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mn>9</mn></msubsup><msub><mpadded lspace=\"0\"><mi>check</mi></mpadded><mi>i</mi></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>q</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo separator=\"true\">,</mo></mrow></mtd></mtr><mtr><mtd class=\"tml-left\" style=\"padding-left:0em;padding-right:0em;\"><mtext>FAIL</mtext></mtd><mtd class=\"tml-left\" style=\"padding-left:1em;padding-right:0em;\"><mtext>otherwise,</mtext></mtd></mtr></mtable><mo fence=\"true\" form=\"postfix\"></mo></mrow></mrow>",
} as const;

function eqNumber(id: string): number {
  const n = EQ_ORDER.indexOf(id) + 1;
  if (n === 0) throw new Error(`Unknown equation: ${id}`);
  return n;
}

/** A numbered display equation. `mathml` is the inside of a <math> element (MathML Core). */
function Eq({ id, mathml, src }: { id: string; mathml: string; src?: string }) {
  return (
    <div className="rb-eq" id={`eq-${id}`}>
      <div className="rb-eq-row">
        <div className="rb-eq-math" dangerouslySetInnerHTML={{ __html: '<math display="block">' + mathml + "</math>" }} />
        <span className="rb-eq-num">({eqNumber(id)})</span>
      </div>
      {src && <p className="rb-eq-src">{src}</p>}
    </div>
  );
}

/** Inline math. */
function M({ mathml }: { mathml: string }) {
  return <span className="rb-im" dangerouslySetInnerHTML={{ __html: "<math>" + mathml + "</math>" }} />;
}

function EqRef({ id }: { id: string }) {
  return <a href={`#eq-${id}`}>({eqNumber(id)})</a>;
}

function Section({ id, n, title, children }: { id: string; n?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="rb-section">
      <h2>{n && <span className="rb-h-num">{n}</span>}{title}</h2>
      {children}
    </section>
  );
}

function Sub({ id, n, title, children }: { id: string; n: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="rb-sub">
      <h3><span className="rb-h-num">{n}</span>{title}</h3>
      {children}
    </section>
  );
}

function Table({ n, caption, children }: { n: number; caption: ReactNode; children: ReactNode }) {
  return (
    <figure className="rb-table" id={`table-${n}`}>
      <figcaption><strong>Table {n}.</strong> {caption}</figcaption>
      <div className="rb-scroll">
        <table>{children}</table>
      </div>
    </figure>
  );
}

function Algorithm({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <figure className="rb-algo" id={`algorithm-${n}`}>
      <figcaption><strong>Algorithm {n}.</strong> {title}</figcaption>
      <ol>{children}</ol>
    </figure>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rb-code">{children}</code>;
}

const TOC: { id: string; label: string; sub?: { id: string; label: string }[] }[] = [
  { id: "abstract", label: "Abstract" },
  { id: "resume", label: "Résumé" },
  { id: "significance", label: "Significance for care teams" },
  { id: "s1", label: "1 Introduction" },
  { id: "s2", label: "2 Related work and data sources" },
  { id: "s3", label: "3 Data" },
  {
    id: "s4", label: "4 Methods", sub: [
      { id: "s4-1", label: "4.1 Segmentation and meshing" },
      { id: "s4-2", label: "4.2 Finite-element formulation" },
      { id: "s4-3", label: "4.3 Material mapping for uploaded CT" },
      { id: "s4-4", label: "4.4 Load cases" },
      { id: "s4-5", label: "4.5 Cohort comparison" },
    ],
  },
  {
    id: "s5", label: "5 The AI layer", sub: [
      { id: "s5-1", label: "5.1 Grounding and provenance" },
      { id: "s5-2", label: "5.2 The checker as acceptance predicates" },
      { id: "s5-3", label: "5.3 Provider fallback policy" },
      { id: "s5-4", label: "5.4 Ask Rainbone as a LangGraph state machine" },
      { id: "s5-5", label: "5.5 Audit and energy meter" },
    ],
  },
  {
    id: "s6", label: "6 Evaluation", sub: [
      { id: "s6-1", label: "6.1 Verification against closed-form solutions" },
      { id: "s6-2", label: "6.2 Standing-load results for Pat001" },
      { id: "s6-3", label: "6.3 Press demonstration" },
      { id: "s6-4", label: "6.4 Uploaded volumes" },
      { id: "s6-5", label: "6.5 Segmentation Dice (pelvic library)" },
      { id: "s6-6", label: "6.6 Red-team evaluation of Ask Rainbone" },
      { id: "s6-7", label: "6.7 Latency where recorded" },
      { id: "s6-8", label: "6.8 Optional native boundary extraction" },
    ],
  },
  { id: "s7", label: "7 Limitations, ethics and privacy" },
  { id: "s8", label: "8 Future work" },
  { id: "references", label: "References" },
  { id: "annex-a", label: "Annex A Notation" },
  { id: "annex-b", label: "Annex B Reproducibility" },
];

const CSS = `
.rb-wrap { min-height: 100vh; background: rgb(var(--canvas)); padding-bottom: 48px; }
.rb-bar { max-width: 820px; margin: 0 auto; padding: 16px; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; }
.rb-back { color: rgb(var(--link)); font-size: 0.9375rem; text-decoration: underline; text-underline-offset: 4px; }
.rb-sheet { max-width: 820px; margin: 0 auto; background: #fff; color: #1d232a; border: 1px solid rgb(var(--line)); box-shadow: 0 10px 30px -12px rgb(20 33 46 / 0.18); padding: 56px 64px 64px; }
.rb-paper { font-family: var(--font-source-serif), Georgia, "Times New Roman", serif; font-weight: 500; font-size: 1.0625rem; line-height: 1.62; }
.rb-paper p, .rb-paper li { text-align: justify; hyphens: auto; -webkit-hyphens: auto; }
.rb-paper p { margin: 0 0 0.85em; }
.rb-paper a { color: #1f4fb4; text-decoration: underline; text-underline-offset: 2px; text-decoration-thickness: 1px; }
.rb-paper strong { font-weight: 600; }
.rb-paper ol.rb-list, .rb-paper ul.rb-list { margin: 0 0 0.9em; padding-left: 1.4em; }
.rb-paper ol.rb-list { list-style: decimal; }
.rb-paper ul.rb-list { list-style: disc; }
.rb-paper .rb-list li { margin: 0.2em 0; padding-left: 0.2em; }
.rb-code { font-family: var(--font-ibm-plex-mono), ui-monospace, monospace; font-size: 0.84em; font-weight: 400; overflow-wrap: anywhere; background: #f3f1ec; padding: 0 3px; border-radius: 3px; }
.rb-meta-line { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 16px; font-family: var(--font-inter), system-ui, sans-serif; font-size: 0.78rem; letter-spacing: 0.04em; text-transform: uppercase; color: #4a5562; border-bottom: 1.5px solid #1d232a; padding-bottom: 8px; }
.rb-title { font-size: 2rem; line-height: 1.2; font-weight: 600; text-align: center; margin: 40px 0 20px; text-wrap: balance; }
.rb-paper .rb-authors { text-align: center; font-size: 1.1rem; margin: 0 0 4px; text-wrap: balance; }
.rb-paper .rb-byline { text-align: center; font-size: 0.95rem; color: #4a5562; margin: 0 0 28px; }
.rb-docdata { width: 100%; border-collapse: collapse; font-family: var(--font-inter), system-ui, sans-serif; font-size: 0.8rem; line-height: 1.45; margin: 0 0 28px; border-top: 1.5px solid #1d232a; border-bottom: 1.5px solid #1d232a; }
.rb-docdata th { text-align: left; font-weight: 600; padding: 6px 12px 6px 0; vertical-align: top; white-space: nowrap; color: #2f3943; width: 1%; }
.rb-docdata td { padding: 6px 0; vertical-align: top; overflow-wrap: anywhere; }
.rb-docdata tr + tr th, .rb-docdata tr + tr td { border-top: 1px solid #e3ded4; }
.rb-abstract { margin: 0 0 22px; }
.rb-abstract h2 { font-size: 1.05rem; font-variant-caps: small-caps; letter-spacing: 0.06em; font-weight: 600; margin: 0 0 6px; text-align: center; }
.rb-abstract p { font-size: 0.97rem; }
.rb-box { border: 1.5px solid #1d232a; background: #f7f5f0; padding: 16px 20px 6px; margin: 8px 0 28px; break-inside: avoid; }
.rb-box h2 { font-family: var(--font-inter), system-ui, sans-serif; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; margin: 0 0 8px; color: #16325c; }
.rb-box p { font-size: 0.98rem; }
.rb-toc { border-top: 1px solid #d9d3c7; border-bottom: 1px solid #d9d3c7; padding: 14px 0 10px; margin: 0 0 12px; }
.rb-toc h2 { font-size: 1.05rem; font-variant-caps: small-caps; letter-spacing: 0.06em; font-weight: 600; margin: 0 0 6px; }
.rb-toc ol { list-style: none; margin: 0; padding: 0; columns: 2 260px; column-gap: 32px; }
.rb-toc li { text-align: left; margin: 0; padding: 1px 0; break-inside: avoid; }
.rb-toc li ol { columns: auto; padding-left: 1.1em; }
.rb-toc a { text-decoration: none; color: #1d232a; }
.rb-toc a:hover { text-decoration: underline; color: #1f4fb4; }
.rb-paper [id] { scroll-margin-top: 144px; }
.rb-section, .rb-anchor { scroll-margin-top: 144px; }
.rb-sub { scroll-margin-top: 144px; }
.rb-section h2 { font-size: 1.4rem; font-weight: 600; font-variant-caps: small-caps; letter-spacing: 0.03em; margin: 2.1em 0 0.6em; padding-bottom: 4px; border-bottom: 1px solid #d9d3c7; break-after: avoid; }
.rb-sub h3 { font-size: 1.12rem; font-weight: 600; margin: 1.6em 0 0.5em; break-after: avoid; }
.rb-h4 { font-style: italic; font-weight: 600; }
.rb-h-num { display: inline-block; min-width: 2.1em; font-variant-caps: normal; font-variant-numeric: lining-nums; }
.rb-eq { margin: 0.9em 0 1em; break-inside: avoid; }
.rb-eq-row { display: flex; align-items: center; gap: 12px; }
.rb-eq-math { flex: 1 1 auto; min-width: 0; overflow-x: auto; overflow-y: hidden; padding: 2px 0;
  /* Scroll shadows: a soft edge appears only on a side that has more equation to scroll to. */
  background: linear-gradient(to right, #fff 30%, rgb(255 255 255 / 0)) left / 28px 100% no-repeat local,
    linear-gradient(to left, #fff 30%, rgb(255 255 255 / 0)) right / 28px 100% no-repeat local,
    radial-gradient(farthest-side at 0 50%, rgb(0 0 0 / 0.16), transparent) left / 10px 100% no-repeat scroll,
    radial-gradient(farthest-side at 100% 50%, rgb(0 0 0 / 0.16), transparent) right / 10px 100% no-repeat scroll; }
.rb-eq-num { flex: none; font-variant-numeric: lining-nums; }
.rb-eq-src { margin: 2px 0 0 !important; text-align: right !important; font-family: var(--font-ibm-plex-mono), ui-monospace, monospace; font-size: 0.7rem; font-weight: 400; line-height: 1.35; color: #5b6570; overflow-wrap: anywhere; hyphens: none !important; }
.rb-paper math { font-family: "STIX Two Math", "Cambria Math", "Latin Modern Math", "Noto Sans Math", math; font-weight: 400; }
.rb-paper math[display="block"] { font-size: 1.04em; }
.rb-im math { font-size: 1em; }
/* Chromium aligns MathML table cells only with the -webkit- keywords; others keep the standard value. */
.rb-paper mtd.tml-right { text-align: right; text-align: -webkit-right; }
.rb-paper mtd.tml-left { text-align: left; text-align: -webkit-left; }
.rb-paper mtable.tml-jot mtd { padding-top: 0.6ex; padding-bottom: 0.6ex; }
.rb-paper mtable.tml-small mtd { padding-top: 0.35ex; padding-bottom: 0.35ex; }
.rb-table { margin: 1.3em 0 1.5em; break-inside: avoid; }
.rb-table figcaption, .rb-algo figcaption, .rb-fig figcaption { font-family: var(--font-inter), system-ui, sans-serif; font-size: 0.8rem; line-height: 1.45; color: #2f3943; margin-bottom: 6px; text-align: left; }
.rb-scroll { overflow-x: auto; }
.rb-table table { width: 100%; border-collapse: collapse; font-family: var(--font-inter), system-ui, sans-serif; font-size: 0.8rem; line-height: 1.4; font-variant-numeric: tabular-nums; border-top: 1.5px solid #1d232a; border-bottom: 1.5px solid #1d232a; }
.rb-table th { text-align: left; font-weight: 600; padding: 6px 10px 5px 0; border-bottom: 1px solid #1d232a; vertical-align: bottom; }
.rb-table td { text-align: left; padding: 5px 10px 5px 0; vertical-align: top; border-top: 1px solid #ebe7df; }
.rb-table tr:first-child td { border-top: 0; }
.rb-table td.n, .rb-table th.n { text-align: right; white-space: nowrap; }
.rb-table td .rb-code { font-size: 0.92em; }
.rb-algo { margin: 1.3em 0 1.5em; border-top: 1.5px solid #1d232a; border-bottom: 1.5px solid #1d232a; padding: 8px 0 6px; break-inside: avoid; }
.rb-algo figcaption { border-bottom: 1px solid #1d232a; padding-bottom: 6px; }
.rb-algo ol { list-style: decimal; margin: 6px 0 0; padding-left: 2.2em; font-size: 0.95rem; line-height: 1.55; }
.rb-algo li { text-align: left !important; padding-left: 0.3em; }
.rb-algo li::marker { font-family: var(--font-ibm-plex-mono), ui-monospace, monospace; font-size: 0.8em; color: #5b6570; }
.rb-algo .i1 { margin-left: 1.2em; } .rb-algo .i2 { margin-left: 2.4em; } .rb-algo .i3 { margin-left: 3.6em; }
.rb-kw { font-weight: 600; }
.rb-fig { margin: 1.5em 0; break-inside: avoid; }
.rb-fig svg { display: block; width: 100%; max-width: 440px; height: auto; margin: 0 auto 8px; }
.rb-fig svg text { font-family: var(--font-inter), system-ui, sans-serif; }
.rb-refs { list-style: none; padding: 0; margin: 0; font-size: 0.95rem; }
.rb-refs li { display: grid; grid-template-columns: 2.4em 1fr; gap: 0 4px; margin: 0 0 0.6em; text-align: left; overflow-wrap: anywhere; }
.rb-small { font-size: 0.9rem; }
.rb-pre { font-family: var(--font-ibm-plex-mono), ui-monospace, monospace; font-size: 0.74rem; font-weight: 400; line-height: 1.55; background: #f6f4ef; border: 1px solid #e3ded4; border-radius: 4px; padding: 10px 12px; margin: 0 0 1em; overflow-x: auto; white-space: pre; tab-size: 2; }
.rb-note { font-family: var(--font-inter), system-ui, sans-serif; font-size: 0.78rem; color: #4a5562; text-align: left !important; }
@media (max-width: 640px) {
  .rb-bar { padding: 12px 16px; }
  .rb-sheet { border-left: 0; border-right: 0; padding: 28px 16px 40px; box-shadow: none; }
  .rb-paper { font-size: 1rem; line-height: 1.58; }
  .rb-title { font-size: 1.5rem; margin-top: 28px; }
  .rb-paper p, .rb-paper li { text-align: left; }
  .rb-paper math[display="block"] { font-size: 0.94em; }
  .rb-eq-row { gap: 8px; }
}
@media print {
  @page { margin: 18mm 16mm; }
  body { background: #fff !important; }
  [data-workspace-view="research"] { min-height: 0 !important; }
  [data-workspace-view="research"] > div { display: block !important; min-height: 0 !important; }
  [data-workspace-view="research"] [data-workspace-sidebar],
  [data-workspace-view="research"] [data-workspace-header] { display: none !important; }
  .rb-noprint { display: none !important; }
  .rb-wrap { background: #fff !important; padding: 0; }
  .rb-sheet { border: 0; box-shadow: none; padding: 0; max-width: none; }
  .rb-paper { font-size: 10.5pt; }
  .rb-eq-math, .rb-scroll { overflow: visible; background: none; }
  .rb-pre { white-space: pre-wrap; overflow-wrap: anywhere; }
  .rb-paper a { color: inherit; text-decoration: none; }
  .rb-section h2, .rb-sub h3 { break-after: avoid; }
}
`;

export default function ResearchPaperPage() {
  return (
    <Dashboard view="research">
    <div className="rb-wrap">
      <style>{CSS}</style>
      <nav className="rb-bar rb-noprint" aria-label="Paper actions">
        <Link href="/dashboard" className="rb-back">← Back to workspace</Link>
        <PrintButton />
      </nav>

      <article className="rb-sheet rb-paper" lang="en">
        <header>
          <div className="rb-meta-line">
            <span>Rainbone project report · Hack the Valley 11</span>
            <span>Research prototype · not a medical device</span>
          </div>
          <h1 className="rb-title">Rainbone: Finite-element stress visualisation of a published femur CT with a rule-checked, bounded-agent AI explanation layer</h1>
          <p className="rb-authors">Galit Tauber, Camila Rojas, Jisara Wuttikreekiat, Marco Anthony Ayuste</p>
          <p className="rb-byline">Rainbone team · Hack the Valley 11 · 18 October 2026</p>
          <table className="rb-docdata">
            <tbody>
              <tr><th scope="row">Report</th><td>Rainbone project report · Hack the Valley 11</td></tr>
              <tr><th scope="row">Date</th><td>18 October 2026</td></tr>
              <tr><th scope="row">Status</th><td>Research prototype · not a medical device</td></tr>
              <tr><th scope="row">Code described</th><td>Rainbone repository, <Code>main</Code> at commit <a href="https://github.com/galitau/Rainbone_prod_hackthevalley11/tree/001a6e2"><Code>001a6e2</Code></a></td></tr>
              <tr><th scope="row">Data</th><td>HFValid collection (CC BY 4.0) [1]; CTPelvic1K sub-dataset 6 (CC BY 4.0) [5]</td></tr>
              <tr><th scope="row">Keywords</th><td>finite-element analysis · femur · von Mises stress · damage mechanics · grounded generation · acceptance predicates · LangGraph</td></tr>
            </tbody>
          </table>
        </header>

        <section id="abstract" className="rb-abstract rb-anchor">
          <h2>Abstract</h2>
          <p>
            Rainbone targets the fracture from a fall: by the time a resident falls and breaks a bone, it is already an emergency. It is
            a research prototype that explores how the loading of a bone can be made visible and
            understandable before a fall. On one published femur CT (HFValid case Pat001) it solves a three-dimensional linear-elastic
            finite-element model with SfePy on 60,819 four-node tetrahedra under an assumed 800 N standing load, and colours the surface by
            volume-weighted nodal von Mises stress (peak 15.83 MPa). Beside the simulation it shows the HFValid authors&apos; own published
            fall results for the same woman: an absolute risk of fracture at time 0 (ARF0) of 47.1 %, higher than 56 of the 101 women in
            the study, and a minimum sideways-fall strength of 1,339 N, which published sideways-fall forces exceed by a factor of 2.17 to
            3.18. A FastAPI service runs the same kind of solve on an uploaded CT with an assumed, bounded map from Hounsfield units to
            Young&apos;s modulus, and a displacement-controlled damage model replays a hydraulic-press demonstration. An AI layer puts these
            numbers into words: code computes every figure, facts are read only when their sha256 matches a pin in the repository, and every
            model answer must pass deterministic acceptance predicates before it is shown. A five-stage pipeline, orchestrated with
            LangGraph, lets models choose read-only tools and approved statement IDs; in Ask, code renders every sentence from that catalogue. In a 32-question, rule-scored red-team run against the production assistant, made before the LangGraph orchestrator was
            deployed, 30 answers passed, 7 of them flagged (including two medical-advice questions answered with facts rather than refused,
            since fixed); both failures were fixed and passed a targeted re-check. The material properties
            and loads are assumptions, the 10.55 % standing-load stress ratio is not a fracture probability, Rainbone gives no forecast and
            no diagnosis, and it stores no patient records.
          </p>
        </section>

        <section id="resume" className="rb-abstract rb-anchor" lang="fr">
          <h2>Résumé</h2>
          <p>
            Rainbone cible la fracture causée par une chute&nbsp;: lorsqu&apos;une personne résidente tombe et se fracture un os,
            c&apos;est déjà une urgence. Rainbone est un prototype de recherche qui explore comment rendre la sollicitation mécanique
            d&apos;un os visible et compréhensible avant une chute. Sur une tomodensitométrie publiée d&apos;un fémur (cas Pat001 de la
            collection HFValid), il résout avec SfePy un modèle d&apos;éléments finis tridimensionnel en élasticité linéaire, composé de
            60&nbsp;819 tétraèdres à quatre nœuds et soumis à une charge supposée de 800&nbsp;N en position debout, puis colore la surface
            selon la contrainte de von Mises moyennée aux nœuds et pondérée par le volume (maximum de 15,83&nbsp;MPa). À côté de la
            simulation, il présente les résultats de chute publiés par les auteurs de HFValid pour la même femme&nbsp;: un risque absolu de
            fracture au temps 0 (ARF0) de 47,1&nbsp;%, supérieur à celui de 56 des 101 femmes de l&apos;étude, et une résistance minimale en
            chute latérale de 1&nbsp;339&nbsp;N, que les forces de chute latérale publiées dépassent d&apos;un facteur de 2,17 à 3,18. Un
            service FastAPI effectue le même type de calcul sur une tomodensitométrie téléversée, à l&apos;aide d&apos;une correspondance
            supposée et bornée entre les unités Hounsfield et le module de Young, et un modèle d&apos;endommagement piloté en déplacement
            rejoue une démonstration de presse hydraulique. Une couche d&apos;IA traduit ces chiffres en mots&nbsp;: le code calcule chaque
            valeur, les faits ne sont lus que si leur empreinte sha256 correspond à celle consignée dans le dépôt, et chaque réponse d&apos;un
            modèle doit satisfaire des prédicats d&apos;acceptation déterministes avant d&apos;être affichée. Une chaîne de traitement en cinq
            étapes, orchestrée avec LangGraph, laisse les modèles choisir des outils en lecture seule et des identifiants d&apos;énoncés
            approuvés&nbsp;; le code rédige chaque phrase, de sorte qu&apos;aucun modèle ne rédige de texte libre. Lors d&apos;un exercice
            d&apos;équipe rouge mené sur l&apos;assistant en production avant le déploiement de l&apos;orchestrateur LangGraph, 32 questions
            ont été évaluées selon des règles fixes&nbsp;: 30 réponses ont été jugées conformes, dont 7 signalées (notamment deux questions
            de conseil médical qui avaient reçu des faits au lieu d&apos;un refus, ce qui a été corrigé depuis)&nbsp;; les deux cas en échec
            ont été corrigés, puis ont satisfait à une nouvelle vérification ciblée. Les propriétés des matériaux et les charges sont des
            hypothèses, le rapport contrainte/résistance de 10,55&nbsp;% en position debout n&apos;est pas une probabilité de fracture,
            Rainbone ne fournit ni prévision ni diagnostic, et il ne conserve aucun dossier de patient.
          </p>
        </section>

        <aside id="significance" className="rb-box rb-anchor" aria-labelledby="significance-title">
          <h2 id="significance-title">Significance for care teams</h2>
          <p>
            By the time a resident falls and breaks a bone, it is already an emergency. Rainbone gives the whole care team (nurses, CNAs,
            wellness directors and doctors) an earlier, clearer picture of bone health: a 3D view of where a femur carries load, where its
            published fall results sit among 101 women, and a plain-words explanation from AI agents that anyone on the team can read and
            share. Every number is computed by code and checked before it is shown, so the team can trust what it brings to a clinician, a
            resident or a family, and it can 3D-print the simulated break as a hands-on teaching model. The prototype runs on a published
            research femur today; bringing it to residents comes next, with consent and PHIPA-compliant agreements in place first. Research
            prototype, not a medical device.
          </p>
        </aside>

        <nav id="toc" className="rb-toc rb-anchor" aria-labelledby="toc-title">
          <h2 id="toc-title">Contents</h2>
          <ol>
            {TOC.map(item => (
              <li key={item.id}>
                <a href={`#${item.id}`}>{item.label}</a>
                {item.sub && (
                  <ol>
                    {item.sub.map(sub => <li key={sub.id}><a href={`#${sub.id}`}>{sub.label}</a></li>)}
                  </ol>
                )}
              </li>
            ))}
          </ol>
        </nav>

        {/* ------------------------------------------------------------------ 1 */}
        <Section id="s1" n="1" title="Introduction">
          <p>
            Rainbone is designed for the care team in nursing homes and senior living: nurses, certified nursing assistants, wellness
            directors, doctors and administrative staff. The problem it targets is the fracture from a fall. By the time a resident falls
            and breaks a bone, it is already an emergency. Rainbone was built at Hack the Valley 11 for PointClickCare&apos;s <em>Catch It Early</em> challenge; it has no
            PointClickCare integration and uses no PointClickCare data or application programming interface (API).
          </p>
          <p>
            The prototype asks what a CT a resident already has could show a care team, and what explanation would make it usable. This
            report documents the build as it stands. It runs on one woman&apos;s femur CT from the published HFValid collection [1], case
            Pat001, and on no resident. The fall numbers it shows are the HFValid authors&apos; published results [1, 2]. Its own
            finite-element analysis (FEA) is an illustrative standing-load solve with assumed, uncalibrated material properties.
          </p>
          <p>
            Two commitments shape the system. First, <strong>code computes, models only word</strong>: every number on screen is produced by
            deterministic code from versioned files, and a language model may only restate those numbers. Second, <strong>every step can be
            checked</strong>: each finite-element solve must satisfy equilibrium to a relative tolerance of <M mathml={"<msup><mn>10</mn><mrow><mo lspace=\"0em\" rspace=\"0em\">−</mo><mn>6</mn></mrow></msup>"} />, each fact file
            read by the AI must match a sha256 pinned in the repository, each model answer must satisfy explicit acceptance predicates, and
            newly generated answers use a best-effort hash audit when the database is configured and available. The contributions are:
          </p>
          <ol className="rb-list">
            <li>A traceable pipeline from a published, author-reviewed CT segmentation to a browser stress map: surface reduction, constrained
              tetrahedral meshing and a P1 linear-elastic solve with residual and force-balance acceptance checks (§4.1–4.2), verified against
              closed-form bars (§6.1).</li>
            <li>A solver for uploaded CT volumes with an explicit, bounded Hounsfield-unit-to-modulus map, a block coarsening rule that keeps a
              request within the 20 s test budget, a bone-fraction stiffness and stress correction, and a bone-weighted percentile statistic
              (§4.3).</li>
            <li>An illustrative displacement-controlled damage model with nonlocal strain averaging and a damped staggered solver, used to
              replay a hydraulic-press demonstration (§4.4).</li>
            <li>A cohort comparison that places one femur among 101 using only the dataset authors&apos; published quantities, with ranks, quartiles
              and a factor of risk computed in code (§4.5).</li>
            <li>An AI explanation layer whose grounding, acceptance rules, provider fallback and audit are stated as formal predicates, and a
              bounded five-stage agent pipeline, orchestrated as a LangGraph state machine, in which models select tools and statement IDs
              and code renders every sentence (§5).</li>
            <li>An evaluation that reports verification tests, the solved results, segmentation overlap for the imaging library, measured
              latencies and a rule-scored red-team run against production, including its failures (§6).</li>
          </ol>
          <p>
            Rainbone shows and explains; it gives no forecast and no diagnosis. Wherever this report quotes a fracture-related quantity, it
            names whose model produced it.
          </p>
        </Section>

        {/* ------------------------------------------------------------------ 2 */}
        <Section id="s2" n="2" title="Related work and data sources">
          <p>
            <strong>Published femur models and fall loads.</strong> The HFValid collection [1] provides whole-femur CT volumes with reviewed
            segmentations, and, for each of its 101 women, the dataset authors&apos; finite-element results and fracture follow-up. Two of
            those results appear in Rainbone. The <em>absolute risk of fracture at time 0</em> (ARF0) comes from the authors&apos; FE model
            coupled with a multiscale falling model; the dataset text cites the method as [Bhattacharya2019], whose full reference appears in
            the repository as [2]. The <em>Minimum Sidefall Strength</em> (MSF) is the minimum critical load over 28 load and
            boundary-condition orientations; the dataset text attributes it to a study tagged [Altai2019], for which the repository holds no
            full reference, so none is listed here. Peak trochanter impact forces of a sideways fall, 2.90 kN for a 5th-percentile woman and
            4.26 kN for a 95th-percentile woman, come from van den Kroonenberg et al. [3]. Rainbone recomputes neither ARF0 nor MSF; it
            reads them from the published metadata.
          </p>
          <p>
            <strong>Failure limits for the press demonstration.</strong> The principal-strain limits used in §4.4 (0.0073 in tension, 0.0104
            in compression) are motivated by published bone finite-element methods; the repository records the source only as a URL [4] and
            states that the limits have not been calibrated or validated against that protocol or this patient.
          </p>
          <p>
            <strong>Segmentation.</strong> The femur geometry is the HFValid authors&apos; own CT segmentation, reviewed and corrected in 3D
            Slicer 4.11 [1]; Rainbone adds no automatic segmentation to it. A separate pelvic imaging library uses TotalSegmentator 2.18.0
            [6], whose documentation asks users to also cite nnU-Net [7], on three CTPelvic1K cases [5]. TotalSegmentator is not part of the
            femur FEA. Uploaded volumes are segmented by a fixed threshold and a connected-component step (§4.1.2).
          </p>
          <p>
            <strong>Software.</strong> The repository names the numerical and orchestration software it uses, with versions, but holds no
            bibliographic references for them. <a href="#table-1">Table 1</a> lists them exactly as recorded rather than supplying citations
            the repository does not contain.
          </p>
          <Table n={1} caption="Software, with the versions recorded in the repository.">
            <thead><tr><th>Software</th><th>Version</th><th>Role in Rainbone</th><th>Recorded in</th></tr></thead>
            <tbody>
              <tr><td>SfePy</td><td>2026.3</td><td>Assembly and direct solve of P1 tetrahedral elasticity</td><td><Code>frontend/public/models/hfvalid-femur/manifest.json</Code></td></tr>
              <tr><td>3D Slicer</td><td>5.12.4</td><td>CT and segmentation import (LPS to RAS), closed-surface export</td><td>same manifest; <Code>scripts/bone_fea/import_femur_in_slicer.py</Code></td></tr>
              <tr><td>VTK filters</td><td>not recorded</td><td><Code>vtkDecimatePro</Code>, <Code>vtkCleanPolyData</Code> (femur); <Code>vtkFlyingEdges3D</Code>, <Code>vtkWindowedSincPolyDataFilter</Code>, <Code>vtkQuadricDecimation</Code> (pelvis)</td><td><Code>scripts/bone_fea/prepare_femur_in_slicer.py</Code>; <Code>scripts/vultr_pipeline/pipeline.py</Code></td></tr>
              <tr><td>TetGen</td><td>1.6.0</td><td>Boundary-conforming tetrahedral meshing</td><td><Code>frontend/public/models/hfvalid-femur/manifest.json</Code></td></tr>
              <tr><td>TotalSegmentator</td><td>2.18.0</td><td>Pelvic imaging library only</td><td><Code>README.md</Code>; <Code>scripts/vultr_pipeline/pipeline.py</Code></td></tr>
              <tr><td>FSL (<Code>fsl-avwutils</Code>, <Code>fsl-cluster</Code>)</td><td>2209.8, 2201.0</td><td>Optional upload bone mask</td><td><Code>backend/README.md</Code></td></tr>
              <tr><td>LangGraph</td><td>1.2.16</td><td>Ask Rainbone orchestration</td><td><Code>backend/requirements.txt</Code></td></tr>
              <tr><td>Gemini models</td><td><Code>gemini-3.8-flash</Code>, <Code>gemini-3.5-flash-lite</Code></td><td>Wording, native function-calling triage, statement selection</td><td><Code>backend/services/llm_providers.py</Code></td></tr>
              <tr><td>Groq</td><td><Code>openai/gpt-oss-120b</Code></td><td>Fallback writer</td><td><Code>backend/services/llm_providers.py</Code></td></tr>
            </tbody>
          </Table>
          <p>
            <strong>Inference energy.</strong> The only energy figure in Rainbone is Google&apos;s published median for one Gemini Apps text
            prompt [8], with its method in [9]. It is displayed for scale and never presented as a measurement (§5.5).
          </p>
        </Section>

        {/* ------------------------------------------------------------------ 3 */}
        <Section id="s3" n="3" title="Data">
          <Sub id="s3-1" n="3.1" title="HFValid cohort table">
            <p>
              The cohort table <Code>frontend/public/models/hfvalid-risk.json</Code> is extracted from <Code>HFValid_Metadata.csv</Code> of
              HFValid collection v3 by <Code>scripts/bone_fea/build_risk_table.py</Code>. It keeps age, height, weight, modelled side,
              fracture follow-up, ARF0 and MSF, and drops every scanner and calibration column. All 101 subjects are women; the build
              rejects any row whose sex is not F. The dataset&apos;s inclusion text requires residence in the Emilia Romagna region, needed to
              follow up fractures, and survival for at least 5 years after the CT scan or a fracture within 5 years. The follow-up records
              <em> whether</em> a subject had a fracture and the days from CT to fracture, not <em>where</em> the fracture was. The file hashes
              to the sha256 pinned beside it, <Code>884f5875…2b6261</Code>. In the code it is labelled de-identified public research data,
              not patient records (<Code>backend/services/clinical_store.py</Code>).
            </p>
            <Table n={2} caption={<>Cohort summary as published in the table (<Code>hfvalid-risk.json</Code>, <Code>cohort</Code>). Quartiles use the inclusive method of Eq. <EqRef id="quartile" />; ARF0 to 0.1 %, MSF to 1 N.</>}>
              <thead><tr><th>Quantity</th><th className="n">min</th><th className="n">Q1</th><th className="n">median</th><th className="n">Q3</th><th className="n">max</th></tr></thead>
              <tbody>
                <tr><td>ARF0, dataset authors&apos; model (%)</td><td className="n">7.8</td><td className="n">32.1</td><td className="n">44.3</td><td className="n">55.5</td><td className="n">78.1</td></tr>
                <tr><td>MSF, dataset authors&apos; model (N)</td><td className="n">286</td><td className="n">1,339</td><td className="n">1,577</td><td className="n">1,842</td><td className="n">2,879</td></tr>
                <tr><td colSpan={6}>n = 101 women; 4 with a recorded fracture during follow-up, whose ARF0 spans 53.7–73.2 %.</td></tr>
              </tbody>
            </Table>
          </Sub>
          <Sub id="s3-2" n="3.2" title="The reference femur, Pat001">
            <p>
              Pat001 is a complete right femur of a woman aged 78 at the scan (<Code>README.md</Code>). The CT is distributed by the authors
              as NRRD with voxel spacing 0.703125 × 0.703125 × 2.0 mm and 256 × 331 × 220 voxels; the source files are pinned by sha256 in
              the femur manifest. Her published values are an ARF0 of 47.10747422 % (shown as 47.1 %) and an MSF of 1,338.861427 N (shown
              as 1,339 N); no fracture was recorded for her during the follow-up (<Code>hfvalid-risk.json</Code>, <Code>subjects.Pat001</Code>).
              Pat001 is the only case with a femur model; <Code>/api/explain</Code> and <Code>/api/ask</Code> accept no other case.
            </p>
          </Sub>
          <Sub id="s3-3" n="3.3" title="CTPelvic1K imaging library">
            <p>
              The imaging library uses CTPelvic1K [5], sub-dataset 6 (CLINIC), which its authors describe as preoperative pelvic-fracture CT
              without metal artefacts. Three cases (0012, 0023 and 0060) were segmented and meshed. The derived masks and meshes are automatic
              segmentations, not the dataset&apos;s annotations, and were not reviewed by a clinician (<Code>scripts/vultr_pipeline/pipeline.py</Code>).
              None of this data enters the FEA or the AI facts.
            </p>
          </Sub>
          <Sub id="s3-4" n="3.4" title="Uploaded volumes">
            <p>
              <Code>POST /api/simulate</Code> accepts NIfTI-1 or NIfTI-2, optionally gzipped, up to 512 MiB, 512³ voxels and 1,024 MiB of
              header and voxel data; the header is parsed first and only the declared bytes are decompressed
              (<Code>backend/services/fea_solver.py</Code>). Uploaded scans are not saved. When a database is configured, a log of simulation
              runs keeps the file name as sent and the solver outputs; it is publicly readable, so files must be named without patient
              details. The bundled sample <Code>frontend/public/sample_bone.nii.gz</Code> is synthetic: an ellipsoid with semi-axes 10, 6 and
              12 mm (3,048 voxels at 750 HU in −1000 HU, 1 mm voxels). It is not anatomy.
            </p>
          </Sub>
        </Section>

        {/* ------------------------------------------------------------------ 4 */}
        <Section id="s4" n="4" title="Methods">
          <p>
            Units throughout are millimetres, newtons and megapascals. Bold symbols are vectors or tensors; Annex A lists the notation. Each
            numbered equation is followed by the file and lines that implement it.
          </p>

          <Sub id="s4-1" n="4.1" title="Segmentation and meshing">
            <p><span className="rb-h4">Reference femur.</span>{" "}
              <Code>scripts/bone_fea/import_femur_in_slicer.py</Code> loads the authors&apos; CT and reviewed segmentation into 3D Slicer
              5.12.4, converts LPS to RAS, saves <Code>bone.seg.nrrd</Code> and exports a closed surface of 71,510 points and 143,016
              triangles. <Code>prepare_femur_in_slicer.py</Code> reduces it with <Code>vtkDecimatePro</Code> (target reduction 0.80,
              topology preserved, no splitting, boundary vertices kept) and <Code>vtkCleanPolyData</Code>, and refuses any surface with open
              or non-manifold edges; the result has 14,303 points and 28,602 triangles. TetGen 1.6.0 meshes it with the switches{" "}
              <Code>-pYq1.4a80z</Code>: a piecewise-linear complex input whose boundary triangles are kept, a radius–edge quality bound of 1.4,
              a requested maximum element volume of 80 mm³ and zero-based numbering. Because the boundary is preserved, TetGen cannot meet the
              volume target everywhere: the largest element is 1,891.83 mm³ and the smallest 3.197 × 10⁻⁵ mm³. The FE mesh has 60,819
              four-node tetrahedra and 17,361 nodes, a volume of 408.092 cm³, and an exterior of 14,304 nodes and 28,604 triangles. Before
              solving, <Code>build_model.py</Code> rejects any element with <M mathml={"<mrow><mi>|</mi><mrow><mspace width=\"0.1667em\"></mspace><mi>det</mi><mo>⁡</mo></mrow><mi>|</mi><mo>&lt;</mo></mrow><mrow><msup><mn>10</mn><mrow><mo lspace=\"0em\" rspace=\"0em\">−</mo><mn>12</mn></mrow></msup></mrow>"} /> and reorders the nodes of any element
              with a negative determinant, so that every element volume
            </p>
            <Eq id="tetVolume" mathml={EQ.tetVolume} src="scripts/bone_fea/build_model.py:25–29, 39; scripts/bone_fea/solve.py:161" />
            <p>
              is positive. Coordinates are RAS in millimetres; the femoral-head centre <M mathml={"<mrow><mi>𝐜</mi><mo>=</mo></mrow><mrow><mo form=\"prefix\" stretchy=\"false\">(</mo><mn>74.5402</mn><mo separator=\"true\">,</mo><mspace width=\"0.1667em\"></mspace><mo>−</mo><mn>1.2438</mn><mo separator=\"true\">,</mo><mspace width=\"0.1667em\"></mspace><mo>−</mo><mn>50.4298</mn><mo form=\"postfix\" stretchy=\"false\">)</mo></mrow>"} /> mm
              is a constant in the import script, and the repository does not record how it was obtained.
            </p>

            <p><span className="rb-h4">Uploaded CT volumes.</span>{" "}
              The bone mask is the largest face-connected (6-connected) component of the voxels at or above 150 HU, with NaN read as −1000 HU:
            </p>
            <Eq id="voxelMask" mathml={EQ.voxelMask} src="backend/services/fea_solver.py:120–155; backend/services/fsl_segmentation.py:71–96" />
            <p>
              When <Code>FSLDIR</Code> is set, FSL computes the same mask (<Code>fslmaths -thr 150 -bin</Code>, <Code>connectedcomp</Code> with
              6-connectivity); otherwise NumPy and SciPy do. The volume is cropped to the component&apos;s bounding box. If the component has
              more than 8,000 voxels, voxels are merged into blocks of <M mathml={"<mrow><msub><mi>f</mi><mi>x</mi></msub><mo>×</mo></mrow><mrow><msub><mi>f</mi><mi>y</mi></msub><mo>×</mo></mrow><mrow><msub><mi>f</mi><mi>z</mi></msub></mrow>"} /> whole voxels, as close to cubic as the
              spacing <M mathml={"<mrow><mo form=\"prefix\" stretchy=\"false\">(</mo><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Δ</mi></mpadded><mi>x</mi></msub><mo separator=\"true\">,</mo><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Δ</mi></mpadded><mi>y</mi></msub><mo separator=\"true\">,</mo><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Δ</mi></mpadded><mi>z</mi></msub><mo form=\"postfix\" stretchy=\"false\">)</mo></mrow>"} /> allows, with the block edge grown until at most 8,000 blocks hold bone:
            </p>
            <Eq id="coarsen" mathml={EQ.coarsen} src="backend/services/fea_solver.py:45–47, 195–205" />
            <p>
              where <M mathml={"<msub><mi>N</mi><mi>b</mi></msub>"} /> is the number of bone voxels and a block counts when it holds any bone voxel, so a thin wall stays connected.
              Each occupied voxel or block is split into six positively oriented, conforming tetrahedra that share its corner-0 to corner-6
              diagonal (split table <Code>[[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6],[0,5,1,6]]</Code>). With integer corner indices{" "}
              <M mathml={"<mi>𝐠</mi>"} />, the nodes are
            </p>
            <Eq id="voxelNodes" mathml={EQ.voxelNodes} src="scripts/bone_fea/solve.py:22–35; backend/services/fea_solver.py:237–246" />
            <p>
              so voxel centres fall on integer multiples of the effective spacing. Array axes 0, 1 and 2 are used as <M mathml={"<mrow><mi>x</mi><mo separator=\"true\">,</mo></mrow><mrow><mi>y</mi><mo separator=\"true\">,</mo></mrow><mrow><mi>z</mi></mrow>"} />; no
              anatomical orientation is applied. The mesh must be one face-connected component of at least 8 voxels spanning at least 4
              voxels along <M mathml={"<mi>z</mi>"} />.
            </p>

            <p><span className="rb-h4">Pelvic imaging library.</span>{" "}
              TotalSegmentator 2.18.0 (task <Code>total</Code>) is asked for <Code>sacrum</Code>, <Code>vertebrae_S1</Code>,{" "}
              <Code>hip_left</Code>, <Code>hip_right</Code>, <Code>femur_left</Code>, <Code>femur_right</Code> and <Code>vertebrae_L5</Code>.
              Because it labels S1 apart from the sacrum, the anatomical sacrum mesh is the union of the two. Each mask is meshed with{" "}
              <Code>vtkFlyingEdges3D</Code> at 0.5 on the padded binary mask, transformed by the NIfTI affine to RAS millimetres, smoothed
              with <Code>vtkWindowedSincPolyDataFilter</Code> (20 iterations, pass band 0.05) and decimated to a per-bone triangle budget
              (sacrum 30,000; each hip 40,000; each femur 30,000; L5 20,000). These meshes are for viewing only.
            </p>
          </Sub>

          <Sub id="s4-2" n="4.2" title="Finite-element formulation">
            <p>
              Both the reference femur and uploaded volumes are solved by <Code>solve_elasticity</Code> in <Code>scripts/bone_fea/solve.py</Code>:
              three-dimensional, static, small-strain, linear elasticity, with no body force. On the domain <M mathml={"<mpadded lspace=\"0\"><mi mathvariant=\"normal\">Ω</mi></mpadded>"} />, with a clamped
              distal slab <M mathml={"<msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Ω</mi></mpadded><mi>D</mi></msub>"} /> and a loaded part <M mathml={"<msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Γ</mi></mpadded><mi>N</mi></msub>"} /> of the boundary, the displacement <M mathml={"<mi>𝐮</mi>"} />{" "}
              satisfies
            </p>
            <Eq id="strongForm" mathml={EQ.strongForm} src="scripts/bone_fea/solve.py:138–143" />
            <p>with the small-strain tensor</p>
            <Eq id="strain" mathml={EQ.strain} src="SfePy dw_lin_elastic / ev_cauchy_stress, called at scripts/bone_fea/solve.py:140, 148" />
            <p>and the isotropic Hooke&apos;s law built by SfePy&apos;s <Code>stiffness_from_youngpoisson</Code>:</p>
            <Eq id="hooke" mathml={EQ.hooke} src="scripts/bone_fea/solve.py:128, 135; scripts/bone_fea/press_solver.py:112–114" />
            <p>
              For the reference femur <M mathml={"<mrow><mi>E</mi><mo>=</mo></mrow><mrow><mn>10,000</mn></mrow>"} /> MPa and <M mathml={"<mrow><mi>ν</mi><mo>=</mo></mrow><mrow><mn>0.3</mn></mrow>"} /> in every element, an assumption that is neither calibrated
              nor taken from CT density; by Eq. <EqRef id="hooke" /> this gives <M mathml={"<mrow><mi>λ</mi><mo>=</mo></mrow><mrow><mn>5769.23</mn></mrow>"} /> MPa and <M mathml={"<mrow><mi>μ</mi><mo>=</mo></mrow><mrow><mn>3846.15</mn></mrow>"} /> MPa
              (derived here, not stored in the repository). SfePy stores symmetric tensors in the order 11, 22, 33, 12, 13, 23, with the
              stiffness matrix acting on engineering shear strains:
            </p>
            <Eq id="voigt" mathml={EQ.voigt} src="SfePy stiffness_from_lame (via stiffness_from_youngpoisson, scripts/bone_fea/solve.py:128)" />
            <p>
              The discrete problem uses continuous piecewise-linear (P1) vector fields <M mathml={"<msub><mi>V</mi><mi>h</mi></msub>"} /> on the four-node tetrahedra (SfePy cell
              type <Code>3_4</Code>, <Code>approx_order=1</Code>). The equation named <Code>balance</Code> is the stiffness term{" "}
              <Code>dw_lin_elastic</Code> minus the traction term <Code>dw_surface_ltr</Code>, both integrated with an order-2 rule:
            </p>
            <Eq id="weakForm" mathml={EQ.weakForm} src="scripts/bone_fea/solve.py:124–142" />
            <p>In matrix form, with the usual P1 strain–displacement matrices <M mathml={"<msub><mi>𝐁</mi><mi>e</mi></msub>"} /> and shape functions <M mathml={"<mi>𝐍</mi>"} />,</p>
            <Eq id="discrete" mathml={EQ.discrete} src="scripts/bone_fea/solve.py:140–146 (assembled inside SfePy)" />
            <p>
              where the sums denote assembly. The system is solved by one Newton iteration (<Code>i_max=1</Code>) with SfePy&apos;s{" "}
              <Code>ScipyDirect</Code> sparse direct solver; on a linear problem this is a single exact linear solve.
            </p>
            <p>
              <span className="rb-h4">Boundary regions of the reference femur.</span>{" "}
              Every node within <M mathml={"<msub><mi>h</mi><mi>D</mi></msub>"} /> of the minimum <M mathml={"<mi>z</mi>"} /> is clamped, interior nodes included: the clamp is the volumetric
              slab <M mathml={"<mrow><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Ω</mi></mpadded><mi>D</mi></msub><mo>=</mo></mrow><mrow><mo form=\"prefix\" stretchy=\"false\">{</mo><mi>𝐱</mi><mo lspace=\"0.2222em\" rspace=\"0.2222em\">:</mo><mtext> </mtext><mi>z</mi><mo>&lt;</mo><msub><mi>z</mi><mrow><mi>min</mi><mo>⁡</mo></mrow></msub><mo>+</mo><msub><mi>h</mi><mi>D</mi></msub><mo form=\"postfix\" stretchy=\"false\">}</mo></mrow>"} />, not a patch of the boundary, and <M mathml={"<msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Γ</mi></mpadded><mi>D</mi></msub>"} /> below is its
              node set. The load is applied to the exterior triangles whose three vertices lie within <M mathml={"<msub><mi>h</mi><mi>N</mi></msub>"} /> of the maximum{" "}
              <M mathml={"<mi>z</mi>"} /> and within 25 mm of the head centre:
            </p>
            <Eq id="femurRegions" mathml={EQ.femurRegions} src="scripts/bone_fea/solve.py:96–123; scripts/bone_fea/build_model.py:31–32" />
            <p>
              The loaded band is intersected with the exterior facets, so faces inside the band are excluded. The traction is uniform and
              scaled so that it integrates to the resultant <M mathml={"<mi>F</mi>"} />:
            </p>
            <Eq id="traction" mathml={EQ.traction} src="scripts/bone_fea/solve.py:109–112, 138" />
            <p>
              <span className="rb-h4">Acceptance of a solve.</span>{" "}
              After the solution is stored, the constraints are removed and the full residual is evaluated. At the clamped nodes it gives
              the support reaction; at the free nodes it measures the equilibrium error. A result outside tolerance raises{" "}
              <Code>RuntimeError</Code> and is never written:
            </p>
            <Eq id="equilibrium" mathml={EQ.equilibrium} src="scripts/bone_fea/solve.py:150–160" />
            <p>
              <span className="rb-h4">Stress recovery.</span>{" "}
              The Cauchy stress is evaluated per element with <Code>ev_cauchy_stress</Code> in <Code>el_avg</Code> mode; on a P1 tetrahedron
              it is constant,
            </p>
            <Eq id="elementStress" mathml={EQ.elementStress} src="scripts/bone_fea/solve.py:148" />
            <p>and SfePy&apos;s <Code>get_von_mises_stress</Code> reduces it to the equivalent stress</p>
            <Eq id="vonMises" mathml={EQ.vonMises} src="scripts/bone_fea/solve.py:149 (SfePy sfepy/mechanics/tensors.py)" />
            <p>
              The raw element values are kept in <Code>bone-fea.vtu</Code>. For continuous contours, <Code>build_model.py</Code> averages them
              at each node over every tetrahedron that shares it, weighted by volume:
            </p>
            <Eq id="nodalAvg" mathml={EQ.nodalAvg} src="scripts/bone_fea/build_model.py:37–45" />
            <p>
              The viewer colours the surface from 0 to the largest surface value of Eq. <EqRef id="nodalAvg" />, and nothing is solved in the
              browser. The cut-away view slices every tetrahedron with a plane <M mathml={"<mrow><mi>𝐧</mi><mo>⋅</mo></mrow><mrow><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>𝐱</mi><mo>−</mo><mi>𝐨</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo>=</mo></mrow><mrow><mn>0</mn></mrow>"} /> and
              interpolates nodal values linearly along each crossing edge <M mathml={"<mrow><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>a</mi><mo separator=\"true\">,</mo><mi>b</mi><mo form=\"postfix\" stretchy=\"false\">)</mo></mrow>"} />, with <M mathml={"<mrow><mi>t</mi><mo>=</mo></mrow><mrow><msub><mi>s</mi><mi>a</mi></msub><mi>/</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><msub><mi>s</mi><mi>a</mi></msub><mo>−</mo><msub><mi>s</mi><mi>b</mi></msub><mo form=\"postfix\" stretchy=\"false\">)</mo></mrow>"} /> and{" "}
              <M mathml={"<mrow><msub><mi>s</mi><mi>a</mi></msub><mo>=</mo></mrow><mrow><mi>𝐧</mi><mo>⋅</mo></mrow><mrow><mo form=\"prefix\" stretchy=\"false\">(</mo><msub><mi>𝐱</mi><mi>a</mi></msub><mo>−</mo><mi>𝐨</mi><mo form=\"postfix\" stretchy=\"false\">)</mo></mrow>"} /> (<Code>frontend/lib/vtu-cut.ts</Code>).
            </p>
            <p>
              <span className="rb-h4">Standing-load stress ratio.</span>{" "}
              The single number shown with the stress map divides the peak surface nodal stress by an <em>assumed</em> strength of 150 MPa:
            </p>
            <Eq id="stressRatio" mathml={EQ.stressRatio} src="scripts/bone_fea/build_model.py:46; frontend/lib/model.ts:34; backend/services/explain.py:175, 330" />
            <p>
              <M mathml={"<msub><mi>R</mi><mtext>stand</mtext></msub>"} /> is an illustrative stress-to-assumed-strength ratio. It is <strong>not</strong> a fracture probability:
              the load is a standing load, not a fall, and the strength is not measured. The project README quotes it as 11 %, the dashboard
              shows 10.6 % and Ask Rainbone&apos;s statement uses 10.55 %. An older API field, <Code>fracture_risk_index_percent</Code>, carries this kind of
              ratio for uploads; it is renamed <Code>stress_to_strength_percent</Code> before any model sees it, and this report calls it a
              stress ratio.
            </p>
          </Sub>

          <Sub id="s4-3" n="4.3" title="Material mapping for uploaded CT">
            <p>
              For uploaded volumes each bone voxel receives its own modulus from its Hounsfield value. The mapping in{" "}
              <Code>hu_to_apparent_density_and_modulus</Code> is a fixed, bounded linear map. Its docstring calls the density a
              &ldquo;calibrated apparent density estimate&rdquo;, but there is no phantom calibration and the map is not a published
              density–modulus relation (<Code>backend/README.md</Code>); this report therefore calls it an uncalibrated bounded linear map:
            </p>
            <Eq id="huDensity" mathml={EQ.huDensity} src="backend/services/fea_solver.py:134–135" />
            <Eq id="huModulus" mathml={EQ.huModulus} src="backend/services/fea_solver.py:136" />
            <p>
              The second form of Eq. <EqRef id="huModulus" /> is an algebraic simplification derived here; it holds because <M mathml={"<mover><mi>ρ</mi><mo stretchy=\"false\" style=\"math-depth:0;\">^</mo></mover>"} />{" "}
              saturates at <M mathml={"<mrow><mi>ρ</mi><mo>=</mo></mrow><mrow><mn>1</mn></mrow>"} />, before the clip at 1.2. Inside the 150 HU mask the map therefore gives 17.5 to 25 GPa, saturating at
              1000 HU (derived). The repository&apos;s own examples agree: 700 HU gives 22.35 GPa and 750 HU gives 22.79 GPa
              (<Code>backend/README.md</Code>). Each tetrahedron then gets its own isotropic modulus through a material function evaluated per
              quadrature point (<Code>solve.py:129–137</Code>). After coarsening, a block <M mathml={"<mi>B</mi>"} /> with <M mathml={"<msub><mi>n</mi><mi>B</mi></msub>"} /> bone voxels has
            </p>
            <Eq id="blockModulus" mathml={EQ.blockModulus} src="backend/services/fea_solver.py:170–181, 247–252" />
            <p>
              so a partly-bone block carries the stiffness of the bone it holds (<M mathml={"<mrow><msub><mi>ϕ</mi><mi>B</mi></msub><mo>=</mo></mrow><mrow><mn>1</mn></mrow>"} /> without coarsening). The stress in the bone
              part of a block, and the statistic reported, are
            </p>
            <Eq id="boneStress" mathml={EQ.boneStress} src="backend/services/fea_solver.py:268–272" />
            <Eq id="percentile" mathml={EQ.percentile} src="backend/services/fea_solver.py:208–216, 273" />
            <p>
              where <M mathml={"<mrow><mi>s</mi><mo form=\"prefix\" stretchy=\"false\">[</mo><mi>j</mi><mo form=\"postfix\" stretchy=\"false\">]</mo></mrow>"} /> is the value at position <M mathml={"<mi>j</mi>"} /> of the sorted element stresses repeated <M mathml={"<msub><mi>n</mi><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">(</mo><mi>j</mi><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msub>"} /> times, once
              per bone voxel. Eq. <EqRef id="percentile" /> equals <Code>np.percentile</Code> of that repeated array without building it, so a few
              corner elements of the voxel mesh do not set the value. The upload&apos;s stress ratio and volumes are
            </p>
            <Eq id="apiIndex" mathml={EQ.apiIndex} src="backend/services/fea_solver.py:43, 274" />
            <Eq id="boneVolume" mathml={EQ.boneVolume} src="backend/services/fea_solver.py:234, 299" />
            <p>
              which are equal by construction: coarsening changes the mesh, not the bone volume it carries. An upload produces neither an
              ARF0 nor an MSF.
            </p>
          </Sub>

          <Sub id="s4-4" n="4.4" title="Load cases">
            <p><span className="rb-h4">Standing load on the reference femur.</span>{" "}
              Eqs. <EqRef id="femurRegions" />–<EqRef id="traction" /> with <M mathml={"<mrow><mi>F</mi><mo>=</mo></mrow><mrow><mn>800</mn></mrow>"} /> N select 2,040 clamped nodes and 1,060 loaded
              exterior triangles with <M mathml={"<mrow><msub><mi>A</mi><mi>N</mi></msub><mo>=</mo></mrow><mrow><mn>1208.153</mn></mrow>"} /> mm², a uniform traction of <M mathml={"<mrow><mn>800</mn><mi>/</mi><mn>1208.153</mn><mo>=</mo></mrow><mrow><mn>0.6622</mn></mrow>"} /> MPa (derived). This is
              an illustrative standing load: distal fixation and head compression are not a musculoskeletal load model, and not a fall
              (<Code>hfvalid-femur/manifest.json</Code>, <Code>limitations</Code>).
            </p>
            <p><span className="rb-h4">Standing load on uploads.</span>{" "}
              Supports and load are placed by the volume&apos;s <M mathml={"<mi>z</mi>"} /> extent, not by anatomy: the two outermost node layers at each end.
            </p>
            <Eq id="uploadBands" mathml={EQ.uploadBands} src="backend/services/fea_solver.py:41–49, 253–263" />
            <p><span className="rb-h4">Hydraulic-press demonstration.</span>{" "}
              The press is a separate, displacement-controlled solve on the same 60,819 tetrahedra; it does not scale the 800 N field. The
              rig on screen is schematic: contact and hydraulics are not solved. The distal 15 mm is clamped and a stroke <M mathml={"<mi>s</mi>"} /> is
              prescribed on the head cap, whose lateral motion stays free; as for the standing load, both node sets include the interior
              nodes of their bands:
            </p>
            <Eq id="pressBc" mathml={EQ.pressBc} src="scripts/bone_fea/build_press.py:95–98; scripts/bone_fea/press_solver.py:92–95" />
            <p>
              The material is the same homogeneous <M mathml={"<mrow><mi>E</mi><mo>=</mo></mrow><mrow><mn>10,000</mn></mrow>"} /> MPa, <M mathml={"<mrow><mi>ν</mi><mo>=</mo></mrow><mrow><mn>0.3</mn></mrow>"} />, scaled per element by an isotropic scalar
              damage <M mathml={"<mrow><msub><mi>d</mi><mi>e</mi></msub><mo>∈</mo></mrow><mrow><mo form=\"prefix\" stretchy=\"false\">[</mo><mn>0</mn><mo separator=\"true\">,</mo><mspace width=\"0.1667em\"></mspace><mn>0.995</mn><mo form=\"postfix\" stretchy=\"false\">]</mo></mrow>"} />, with one quadrature point per tetrahedron:
            </p>
            <Eq id="degraded" mathml={EQ.degraded} src="scripts/bone_fea/press_solver.py:81–90, 110–114" />
            <p>The constant strain of each tetrahedron is recovered from its edge vectors, with tensor (not engineering) shear:</p>
            <Eq id="cstStrain" mathml={EQ.cstStrain} src="scripts/bone_fea/press_solver.py:19–23" />
            <p>
              To suppress peaks in tiny elements, strains are averaged over the element centroids <M mathml={"<msub><mi>𝐜</mi><mi>e</mi></msub>"} /> within{" "}
              <M mathml={"<mrow><mi>ℓ</mi><mo>=</mo></mrow><mrow><mn>3</mn></mrow>"} /> mm, weighted by volume (the element itself included):
            </p>
            <Eq id="nonlocal" mathml={EQ.nonlocal} src="scripts/bone_fea/press_solver.py:10–16; scripts/bone_fea/build_press.py:101–104" />
            <p>
              The failure ratio compares the largest and smallest principal averaged strains, <M mathml={"<msub><mover><mi>ε</mi><mo stretchy=\"false\" style=\"math-depth:0;\">‾</mo></mover><mpadded lspace=\"0\"><mi mathvariant=\"normal\">I</mi></mpadded></msub>"} /> and{" "}
              <M mathml={"<msub><mover><mi>ε</mi><mo stretchy=\"false\" style=\"math-depth:0;\">‾</mo></mover><mpadded lspace=\"0\"><mi>III</mi></mpadded></msub>"} />, with the assumed limits, and its running maximum is an irreversible history variable:
            </p>
            <Eq id="failureRatio" mathml={EQ.failureRatio} src="scripts/bone_fea/press_solver.py:26–29" />
            <Eq id="history" mathml={EQ.history} src="scripts/bone_fea/build_press.py:139, 156" />
            <p>Damage follows an exponential softening law that stays zero until the ratio reaches 1 and keeps 0.5 % residual stiffness:</p>
            <Eq id="damageLaw" mathml={EQ.damageLaw} src="scripts/bone_fea/press_solver.py:32–35" />
            <p>Elements near the fixtures are never damaged, which defines the eligible set <M mathml={"<mi class=\"mathcal\">ℰ</mi>"} />:</p>
            <Eq id="fixture" mathml={EQ.fixture} src="scripts/bone_fea/build_press.py:100, 141" />
            <p>
              Because the undamaged problem is linear, one elastic solve at a 1 mm stroke gives both the stiffness (9,887.25 N/mm) and the
              stroke at which the first eligible element reaches an assumed limit. The 15 exported steps are multiples of it:
            </p>
            <Eq id="onset" mathml={EQ.onset} src="scripts/bone_fea/build_press.py:105–107, 128–132" />
            <p>
              Each step alternates equilibrium solves and damage updates (Algorithm 1). The committed damage <M mathml={"<msup><mi>𝐝</mi><mi>n</mi></msup>"} /> of the
              previous step never decreases; trial iterates are damped by one half:
            </p>
            <Eq id="staggered" mathml={EQ.staggered} src="scripts/bone_fea/build_press.py:133–155" />
            <Algorithm n={1} title="One press step (build_press.py, press_solver.py).">
              <li><span className="rb-kw">input</span> stroke <M mathml={"<msub><mi>s</mi><mi>k</mi></msub>"} />, committed damage <M mathml={"<msup><mi>𝐝</mi><mi>n</mi></msup>"} />, history <M mathml={"<msup><mi>𝜿</mi><mi>n</mi></msup>"} />, eligible set <M mathml={"<mi class=\"mathcal\">ℰ</mi>"} /></li>
              <li><M mathml={"<mrow><msup><mi>𝐝</mi><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">(</mo><mn>0</mn><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msup><mo stretchy=\"false\">←</mo></mrow><mrow><msup><mi>𝐝</mi><mi>n</mi></msup></mrow>"} /> (or the trial damage saved in a checkpoint)</li>
              <li><span className="rb-kw">for</span> <M mathml={"<mrow><mi>i</mi><mo>=</mo></mrow><mrow><mn>0,1</mn><mo separator=\"true\">,</mo></mrow><mrow><mo>…</mo></mrow><mrow><mo separator=\"true\">,</mo></mrow><mrow><mn>199</mn></mrow>"} />:</li>
              <li className="i1">solve Eq. <EqRef id="weakForm" /> with <M mathml={"<mrow><msub><mi>𝐃</mi><mi>e</mi></msub><mo>=</mo></mrow><mrow><mo form=\"prefix\" stretchy=\"false\">(</mo><mn>1</mn><mo>−</mo><msubsup><mi>d</mi><mi>e</mi><mrow class=\"tml-lrg-pad\"><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">(</mo><mi>i</mi><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msubsup><mo form=\"postfix\" stretchy=\"false\">)</mo><msub><mi>𝐃</mi><mn>0</mn></msub></mrow>"} /> and the stroke of Eq. <EqRef id="pressBc" /> (one SuperLU factorisation, MMD_AT_PLUS_A ordering)</li>
              <li className="i1"><M mathml={"<mover><mi>𝜺</mi><mo stretchy=\"false\" style=\"math-depth:0;\">‾</mo></mover>"} /> by Eq. <EqRef id="nonlocal" />, <M mathml={"<mi>𝜼</mi>"} /> by Eq. <EqRef id="failureRatio" />, <M mathml={"<mrow><mi>𝜿</mi><mo stretchy=\"false\">←</mo></mrow><mrow><mrow><mi>max</mi><mo>⁡</mo></mrow><mo form=\"prefix\" stretchy=\"false\">(</mo><msup><mi>𝜿</mi><mi>n</mi></msup><mo separator=\"true\">,</mo><mi>𝜼</mi><mo form=\"postfix\" stretchy=\"false\">)</mo></mrow>"} /></li>
              <li className="i1"><M mathml={"<mrow><mover><mi>𝐝</mi><mo stretchy=\"false\" style=\"math-depth:0;\">~</mo></mover><mo stretchy=\"false\">←</mo></mrow><mrow><mrow><mi>max</mi><mo>⁡</mo></mrow><mo form=\"prefix\" stretchy=\"false\">(</mo><msup><mi>𝐝</mi><mi>n</mi></msup><mo separator=\"true\">,</mo><mi>d</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>𝜿</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo form=\"postfix\" stretchy=\"false\">)</mo></mrow>"} />; <M mathml={"<mrow><msub><mover><mi>d</mi><mo stretchy=\"false\" class=\"chr-lrg wbk-lrg\" style=\"math-depth:0;\">~</mo></mover><mi>e</mi></msub><mo stretchy=\"false\">←</mo></mrow><mrow><mn>0</mn></mrow>"} /> for <M mathml={"<mrow><mi>e</mi><mo>∉</mo></mrow><mrow><mi class=\"mathcal\">ℰ</mi></mrow>"} /></li>
              <li className="i1"><span className="rb-kw">if</span> <M mathml={"<mrow><mo form=\"prefix\" stretchy=\"false\">‖</mo></mrow><mrow><mover><mi>𝐝</mi><mo stretchy=\"false\" style=\"math-depth:0;\">~</mo></mover><mo>−</mo></mrow><mrow><msup><mi>𝐝</mi><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">(</mo><mi>i</mi><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msup><msub><mo form=\"postfix\" stretchy=\"false\">‖</mo><mi>∞</mi></msub><mo>&lt;</mo></mrow><mrow><mn>0.002</mn></mrow>"} />: <span className="rb-kw">break</span></li>
              <li className="i1"><M mathml={"<mrow><msup><mi>𝐝</mi><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">(</mo><mi>i</mi><mo>+</mo><mn>1</mn><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msup><mo stretchy=\"false\">←</mo></mrow><mrow><mrow><mi>max</mi><mo>⁡</mo></mrow><mo form=\"prefix\" stretchy=\"false\">(</mo><msup><mi>𝐝</mi><mi>n</mi></msup><mo separator=\"true\">,</mo><mstyle displaystyle=\"false\" scriptlevel=\"0\"><mfrac><mn>1</mn><mn>2</mn></mfrac></mstyle><msup><mi>𝐝</mi><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">(</mo><mi>i</mi><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msup><mo>+</mo><mstyle displaystyle=\"false\" scriptlevel=\"0\"><mfrac><mn>1</mn><mn>2</mn></mfrac></mstyle><mover><mi>𝐝</mi><mo stretchy=\"false\" style=\"math-depth:0;\">~</mo></mover><mo form=\"postfix\" stretchy=\"false\">)</mo></mrow>"} /></li>
              <li><span className="rb-kw">if</span> no break: <span className="rb-kw">abort</span> without writing a manifest</li>
              <li><M mathml={"<mrow><msup><mi>𝜿</mi><mrow><mi>n</mi><mo>+</mo><mn>1</mn></mrow></msup><mo stretchy=\"false\">←</mo></mrow><mrow><mi>𝜿</mi></mrow>"} />; check Eq. <EqRef id="pressLoad" />; export the frame and its metrics</li>
            </Algorithm>
            <p>The press load is the reaction at the prescribed cap degrees of freedom, recovered from the residual, not taken from the animation:</p>
            <Eq id="pressLoad" mathml={EQ.pressLoad} src="scripts/bone_fea/press_solver.py:117–128" />
            <p>
              where the free degrees of freedom exclude every degree of freedom at clamped nodes and the <M mathml={"<mi>z</mi>"} /> component at cap nodes.
              Each frame records
            </p>
            <Eq id="volFractions" mathml={EQ.volFractions} src="scripts/bone_fea/build_press.py:166–167" />
            <p>
              Erosion is for display only: elements with <M mathml={"<mrow><msub><mi>d</mi><mi>e</mi></msub><mo>≥</mo></mrow><mrow><mn>0.95</mn></mrow>"} /> are hidden from the rendered surface, while the mechanical solve
              keeps their residual stiffness. The visible gap is therefore not a crack, contact or fragment result. The default
              &ldquo;failure proximity&rdquo; colour is each face&apos;s owning-element <M mathml={"<mi>κ</mi>"} /> on a fixed 0–1 scale, red at the assumed
              limit; it is neither a stress nor a probability. The manifest lists what is not modelled: calibrated CT-density material, contact,
              hydraulics, large deformation and fracture-energy regularisation, so the softening is mesh-dependent.
            </p>
            <Table n={3} caption="Press-demonstration parameters, all explicit and uncalibrated (femur-press/manifest.json; press_solver.py; build_press.py).">
              <thead><tr><th>Parameter</th><th className="n">Value</th></tr></thead>
              <tbody>
                <tr><td>Young&apos;s modulus, Poisson ratio</td><td className="n">10,000 MPa, 0.3</td></tr>
                <tr><td>Tensile and compressive principal-strain limits</td><td className="n">0.0073, 0.0104</td></tr>
                <tr><td>Softening coefficient β; residual stiffness r</td><td className="n">3; 0.005</td></tr>
                <tr><td>Strain-averaging radius ℓ</td><td className="n">3.0 mm</td></tr>
                <tr><td>Fixture exclusion (distal end; head centre)</td><td className="n">30 mm; 30 mm</td></tr>
                <tr><td>Damage tolerance; relaxation; iteration cap</td><td className="n">0.002; 0.5; 200</td></tr>
                <tr><td>Equilibrium tolerance (relative)</td><td className="n">10⁻⁶</td></tr>
                <tr><td>Render erosion threshold</td><td className="n">d ≥ 0.95</td></tr>
              </tbody>
            </Table>
          </Sub>

          <Sub id="s4-5" n="4.5" title="Cohort comparison">
            <p>
              The comparison beside the stress map uses only the dataset authors&apos; published numbers; no Rainbone FE result enters it.
              The dataset defines ARF0 as follows: &ldquo;The FE model was also coupled with a multiscale falling model to estimate the
              Absolute Risk of Fracture at time 0 (ARF0), as reported in [Bhattacharya2019].&rdquo; MSF is defined as the minimum, over 28
              load and boundary-condition orientations, of the critical load that would cause a fracture in the authors&apos; FE model. ARF0
              is therefore the HFValid authors&apos; published model estimate, not a figure Rainbone computes. The AI checkers reject wording
              that calls it a probability or gives it a time horizon (§5.2), and this report does neither. With <M mathml={"<msub><mi>A</mi><mi>j</mi></msub>"} /> and <M mathml={"<msub><mi>M</mi><mi>j</mi></msub>"} /> the published ARF0 and MSF of subject{" "}
              <M mathml={"<mi>j</mi>"} />, code computes two ranks:
            </p>
            <Eq id="ranks" mathml={EQ.ranks} src="backend/services/risk.py:307–308, 316, 323" />
            <p>
              <M mathml={"<msup><mi>r</mi><mpadded lspace=\"0\" class=\"tml-sml-pad\"><mi>ARF0</mi></mpadded></msup>"} /> counts women with a lower ARF0; <M mathml={"<msup><mi>r</mi><mpadded lspace=\"0\" class=\"tml-sml-pad\"><mi>MSF</mi></mpadded></msup>"} /> counts women with a stronger femur. For
              Pat001, <M mathml={"<mrow><msup><mi>r</mi><mpadded lspace=\"0\" class=\"tml-sml-pad\"><mi>ARF0</mi></mpadded></msup><mo>=</mo></mrow><mrow><mn>56</mn></mrow>"} /> and <M mathml={"<mrow><msup><mi>r</mi><mpadded lspace=\"0\" class=\"tml-sml-pad\"><mi>MSF</mi></mpadded></msup><mo>=</mo></mrow><mrow><mn>75</mn></mrow>"} /> of <M mathml={"<mrow><mi>N</mi><mo>=</mo></mrow><mrow><mn>101</mn></mrow>"} />. The cohort quartiles in Table 2 use
              Python&apos;s <Code>statistics.quantiles(n=4, method=&apos;inclusive&apos;)</Code>, which on the 0-indexed order statistics{" "}
              <M mathml={"<mrow><msub><mi>x</mi><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">(</mo><mn>0</mn><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msub><mo>≤</mo></mrow><mrow><mo>⋯</mo></mrow><mrow><mo>≤</mo></mrow><mrow><msub><mi>x</mi><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">(</mo><mi>N</mi><mo>−</mo><mn>1</mn><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msub></mrow>"} /> is
            </p>
            <Eq id="quartile" mathml={EQ.quartile} src="scripts/bone_fea/build_risk_table.py:112–115" />
            <p>
              With <M mathml={"<mrow><mi>N</mi><mo>=</mo></mrow><mrow><mn>101</mn></mrow>"} />, <M mathml={"<mi>h</mi>"} /> is an integer, so <M mathml={"<mrow><msub><mi>Q</mi><mn>1</mn></msub><mo>=</mo></mrow><mrow><msub><mi>x</mi><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">(</mo><mn>25</mn><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msub></mrow>"} /> and <M mathml={"<mrow><msub><mi>Q</mi><mn>3</mn></msub><mo>=</mo></mrow><mrow><msub><mi>x</mi><mrow><mo form=\"prefix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">(</mo><mn>75</mn><mo form=\"postfix\" stretchy=\"false\" lspace=\"0em\" rspace=\"0em\">)</mo></mrow></msub></mrow>"} /> exactly. Pat001&apos;s MSF is
              the 26th-lowest value, which is why it equals the cohort&apos;s MSF Q1 of 1,339 N. The factor of risk divides the published
              sideways-fall forces by the femur&apos;s MSF:
            </p>
            <Eq id="factorRisk" mathml={EQ.factorRisk} src="backend/services/risk.py:326–327" />
            <p>
              The browser computes the same ratio without rounding (<Code>frontend/lib/model.ts:85–86</Code>) and the dashboard shows it to
              one decimal, 2.2–3.2× (<Code>frontend/components/metrics-explainer.tsx:39</Code>). The deterministic sentence that compares a
              fall with the femur&apos;s strength is chosen by a fixed rule:
            </p>
            <Eq id="templateRule" mathml={EQ.templateRule} src="backend/services/risk.py:542–549" />
            <p>
              For Pat001 the first case applies, since 2,900 N exceeds the strongest MSF in the cohort, 2,879 N. All of these numbers are
              computed before any model is called (§5.1).
            </p>
          </Sub>
        </Section>

        {/* ------------------------------------------------------------------ 5 */}
        <Section id="s5" n="5" title="The AI layer">
          <p>
            Three endpoints use language models: <Code>POST /api/explain</Code> words the FE numbers, <Code>POST /api/risk-analysis</Code>{" "}
            words the cohort comparison, and <Code>POST /api/ask</Code> answers follow-up questions. They run in one FastAPI process and share
            provider configuration, cooldowns and logging. The README describes the AI layer as &ldquo;a fixed
            evidence-to-explanation workflow: retrieval, deterministic calculation, generation, validation and provenance. It does not use
            autonomous clinical agents.&rdquo; Ask Rainbone adds a bounded agent pipeline (§5.4). It is &ldquo;agentic&rdquo; only in a narrow
            sense: models choose among allowlisted read-only tools and approved statement IDs, and code renders every sentence.
          </p>

          <Sub id="s5-1" n="5.1" title="Grounding and provenance">
            <p>
              Exactly two files ground the AI: the HFValid cohort table and the Pat001 femur manifest. They live in a private{" "}
              <Code>clinical/</Code> prefix in Vultr Object Storage, with bundled copies in <Code>frontend/public/models/</Code> and their
              sha256 pins committed next to them (<Code>884f5875…2b6261</Code> and <Code>4a50adbc…5a10c</Code>). For a file <M mathml={"<mi>f</mi>"} /> with
              stored bytes <M mathml={"<msub><mi>b</mi><mi>f</mi></msub>"} /> and bucket index entry (key <M mathml={"<msub><mi>k</mi><mtext>idx</mtext></msub>"} />, hash <M mathml={"<msub><mi>h</mi><mtext>idx</mtext></msub>"} />, size{" "}
              <M mathml={"<msub><mi>n</mi><mtext>idx</mtext></msub>"} />), a bucket read is accepted only if
            </p>
            <Eq id="grounded" mathml={EQ.grounded} src="backend/services/clinical_store.py:216–243" />
            <p>Otherwise the bundled copy is used, and only if it too matches the pin:</p>
            <Eq id="fallbackG" mathml={EQ.fallbackG} src="backend/services/clinical_store.py:246–256, 285–317" />
            <p>
              A changed bucket object therefore cannot change the facts, and a changed local copy stops generation (fail closed). The bucket
              client makes one attempt per object (connect timeout 1 s, read timeout 1.5 s) and accepts at most 4 MiB. Verified reads are
              cached for 600 s and fallbacks for 60 s. The two explanation cards carry a <Code>grounding</Code> object with store, key, sha256,{" "}
              <Code>verified</Code> and, after a fallback, a reason that never names a credential, the endpoint, the bucket or a URL (a bucket
              error is reported by HTTP status and error code only). Ask retains per-file provenance; its aggregate grounding is absent when the
              two verified files came from different stores (<Code>backend/services/ask.py:218–223</Code>).
            </p>
            <p>
              <span className="rb-h4">Facts, not model arithmetic.</span>{" "}
              The explanation card&apos;s facts for Pat001 are read from the manifest and rounded to two decimals:{" "}
              <Code>load_newtons</Code> 800.0, <Code>max_von_mises_stress_mpa</Code> 15.83, <Code>average_youngs_modulus_gpa</Code> 10.0,{" "}
              <Code>bone_volume_cm3</Code> 408.09 and <Code>stress_to_strength_percent</Code> 10.55 (<Code>backend/services/explain.py:297–336</Code>).
              The risk card&apos;s facts (age, ARF0, both ranks, cohort size, median, fractured count and ARF0 range, MSF, fall forces, factor
              of risk, strongest cohort MSF and recorded outcome) are computed by Eqs. <EqRef id="ranks" />–<EqRef id="factorRisk" />. The model
              never receives a scan or its file name, and the risk model never receives Rainbone&apos;s own FE numbers. Ask builds one evidence
              bundle from both grounded files, refuses to proceed unless both are verified, and identifies it by a digest that enters every
              cache key:
            </p>
            <Eq id="askDigest" mathml={EQ.askDigest} src="backend/services/ask.py:28, 214–224, 343–344" />
          </Sub>

          <Sub id="s5-2" n="5.2" title="The checker as acceptance predicates">
            <p>
              Each route accepts model text <M mathml={"<mi>τ</mi>"} /> only if an acceptance predicate holds; a rejected text moves the request to the
              next provider. Both prose checkers start from the same allowed-number set: every numeric fact, as a magnitude, and its roundings
              to 0, 1 and 2 decimals, compared with a tight tolerance.
            </p>
            <Eq id="allowedSet" mathml={EQ.allowedSet} src="backend/services/explain.py:348–354, 383; backend/services/risk.py:355–361, 398–399" />
            <p>
              Numbers are read with their sign, so a negative number fails against the magnitudes in <M mathml={"<mi class=\"mathcal\">𝒜</mi>"} />. A digit run after
              letters counts as a number (&ldquo;15mm&rdquo; reads 15), except the exponent of cm³ or mm².
            </p>
            <p>
              <span className="rb-h4">Plain-words card (<Code>/api/explain</Code>).</span>{" "}
              Let <M mathml={"<mrow><mi class=\"mathcal\">𝒩</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>τ</mi><mo form=\"postfix\" stretchy=\"false\">)</mo></mrow>"} /> be the numbers in a text <M mathml={"<mi>τ</mi>"} /> and <M mathml={"<mrow><msub><mi class=\"mathcal\">𝒩</mi><mi>U</mi></msub><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>τ</mi><mo form=\"postfix\" stretchy=\"false\">)</mo></mrow>"} /> those followed by a
              unit. A unit binds a
              number to one fact: <M mathml={"<mrow><mi>k</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>%</mi><mo form=\"postfix\" stretchy=\"false\">)</mo></mrow>"} /> is the stress ratio, <M mathml={"<mrow><mi>k</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mtext>MPa</mtext><mo form=\"postfix\" stretchy=\"false\">)</mo></mrow>"} /> the stress, <M mathml={"<mrow><mi>k</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mtext>GPa</mtext><mo form=\"postfix\" stretchy=\"false\">)</mo></mrow>"} /> the
              modulus, <M mathml={"<mrow><mi>k</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mtext>N</mtext><mo form=\"postfix\" stretchy=\"false\">)</mo></mrow>"} /> the load and <M mathml={"<mrow><mi>k</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><msup><mtext>cm</mtext><mn>3</mn></msup><mo form=\"postfix\" stretchy=\"false\">)</mo></mrow>"} /> the volume.
            </p>
            <Eq id="explainNum" mathml={EQ.explainNum} src="backend/services/explain.py:123–130, 379–390" />
            <Eq id="acceptE" mathml={EQ.acceptE} src="backend/services/explain.py:371–401" />
            <p>
              Here <M mathml={"<msub><mi>W</mi><mi>#</mi></msub>"} /> detects spelled-out quantities (34 number words with their plurals and <em>-fold</em> forms, plus 14 words
              such as <em>half</em>, <em>double</em> and <em>twice</em>); <M mathml={"<mi>ω</mi>"} /> first rewrites a lone number word directly followed
              by a unit and equal to a fact into digits (&ldquo;seventeen GPa&rdquo; when 17 is a fact), and never a joined form such as
              &ldquo;twenty-two&rdquo;. The number and unit predicates are therefore evaluated on <M mathml={"<mrow><mi>ω</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>τ</mi><mo form=\"postfix\" stretchy=\"false\">)</mo></mrow>"} />, not on{" "}
              <M mathml={"<mi>τ</mi>"} />: if 17 is the stress, &ldquo;seventeen GPa&rdquo; becomes &ldquo;17 GPa&rdquo; and <M mathml={"<msub><mi>P</mi><mtext>unit</mtext></msub>"} />{" "}
              rejects it, because 17 is not the modulus. <M mathml={"<msub><mi>B</mi><mi>E</mi></msub>"} /> is a list of 27 case-insensitive patterns covering diagnosis, prediction,
              recommendation, treatment, probability, risk, fracture and breaking, safety, health and patient words, and{" "}
              <M mathml={"<msub><mi>K</mi><mi>E</mi></msub>"} /> rejects JSON field names read aloud. The prompt asks for 600 characters; 700 is the hard limit. Every accepted
              answer is followed by a fixed note: &ldquo;Illustrative engineering simulation with assumed material properties, not a medical
              assessment.&rdquo;
            </p>
            <p>
              <span className="rb-h4">Risk card (<Code>/api/risk-analysis</Code>).</span>{" "}
              Here the words fracture, risk, break and fall are allowed, so the checker instead binds every number to its kind. The allowed set{" "}
              <M mathml={"<msub><mi class=\"mathcal\">𝒜</mi><mi>R</mi></msub>"} /> excludes Rainbone&apos;s own FE numbers, and each kind has its own pool:
            </p>
            <Eq id="kindPools" mathml={EQ.kindPools} src="backend/services/risk.py:114–124, 364–376" />
            <p>
              where <M mathml={"<mrow><mi class=\"mathcal\">ℛ</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mo form=\"prefix\" stretchy=\"false\">⋅</mo><mo form=\"postfix\" stretchy=\"false\">)</mo></mrow>"} /> is the set of the arguments rounded to 0, 1 and 2 decimals, <M mathml={"<mover><mi>A</mi><mo stretchy=\"false\" class=\"chr-lrg wbk-lrg\" style=\"math-depth:0;\">~</mo></mover>"} /> the cohort
              median ARF0 and <M mathml={"<msub><mi>n</mi><mi>F</mi></msub>"} /> the number of women with a recorded fracture. The kind <M mathml={"<mrow><mi>κ</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>x</mi><mo form=\"postfix\" stretchy=\"false\">)</mo></mrow>"} /> of a number is read from
              the words after it (a unit, or &ldquo;women&rdquo;), or is &ldquo;count of women&rdquo; when &ldquo;than&rdquo; precedes it within 40
              characters. Then
            </p>
            <Eq id="perNumber" mathml={EQ.perNumber} src="backend/services/risk.py:389–395, 498–509" />
            <Eq id="timeOk" mathml={EQ.timeOk} src="backend/services/risk.py:400–410" />
            <p>
              Any other number with a time unit is rejected as a time prediction, as are 16 time-horizon patterns without a number
              (&ldquo;next year&rdquo;, &ldquo;within&rdquo;, &ldquo;lifetime&rdquo; and others). Rank statements must point the right way
              whenever the two ranks differ:
            </p>
            <Eq id="rankDir" mathml={EQ.rankDir} src="backend/services/risk.py:102–113, 412–428" />
            <p>
              The test that pins this rule quotes a live Gemini answer that the number check alone let through, which called Pat001&apos;s MSF
              &ldquo;stronger than 75 women&rdquo;, the opposite of the data (<Code>backend/tests/test_risk.py:267–283</Code>). Writing{" "}
              <M mathml={"<msup><mi>τ</mi><mo lspace=\"0em\" rspace=\"0em\" class=\"tml-prime\">′</mo></msup>"} /> for the text with the digit of &ldquo;ARF0&rdquo; and &ldquo;time 0&rdquo; removed and with fact-valued counts of
              women (&ldquo;four women&rdquo;) read as digits, the risk card accepts
            </p>
            <Eq id="acceptR" mathml={EQ.acceptR} src="backend/services/risk.py:486–529" />
            <p>
              <M mathml={"<msub><mi>D</mi><mpadded lspace=\"0\"><mi>ARF0</mi></mpadded></msub>"} /> requires any &ldquo;ARF0 is <em>X</em> %&rdquo; declaration to state this femur&apos;s 47.1 % unless a
              nearby word names the median, the fractured women or another ARF0. <M mathml={"<mi>T</mi>"} /> holds the 16 time patterns and <M mathml={"<msub><mi>B</mi><mi>R</mi></msub>"} /> 69
              blocked patterns: diagnosis, disease, treatment and drug names, advice and referral words, imperatives, second-person address,
              chance, probability, odds and likelihood, certainty words such as <em>will</em> and <em>guarantee</em>, cancer, validation, and
              three patterns that name the hip as the fracture site, since the follow-up does not record where a fracture occurred.{" "}
              <M mathml={"<mpadded lspace=\"0\"><mi>Sem</mi></mpadded>"} /> is a set of conservative sentence checks (a comparison whose subject is ARF0 must use the ARF0 rank,
              &ldquo;its MSF is <em>X</em> N&rdquo; must be the MSF, a recorded-outcome sentence must agree with the follow-up), which the code
              itself describes as &ldquo;not a proof of arbitrary prose meaning&rdquo;. Every accepted answer ends with &ldquo;Published
              research data, not a diagnosis or medical advice.&rdquo;
            </p>
            <p>
              <span className="rb-h4">Deterministic template.</span>{" "}
              Each chain ends in a template that needs no network and is correct by construction; if it ever failed its checker, the request
              would raise rather than show unchecked text. For Pat001 the risk template reads: &ldquo;A sideways fall would load this femur
              2.17 to 3.18 times its minimum sidefall strength (MSF, 1,339 N) in the study authors&apos; model. Such a fall would exceed the MSF
              of every femur in the study; 75 of the 101 women had a stronger femur. Its published absolute risk of fracture at time 0 (ARF0)
              is 47.1%, higher than 56 of the 101 women. No fracture was recorded for this woman during the study&apos;s follow-up.&rdquo;
              (<Code>backend/services/risk.py:539–563</Code>).
            </p>
            <p>
              These predicates catch explicit failure patterns by rule. As the README states, they are &ldquo;not unrestricted semantic
              verification or clinical validation; accepted prose still needs human review.&rdquo; <a href="#table-4">Table 4</a> summarises
              the three checkers; the Ask critic is defined in §5.4.
            </p>
            <Table n={4} caption="The three acceptance predicates side by side.">
              <thead><tr><th>Route</th><th>Model output</th><th>Length</th><th>Numbers</th><th>Wording</th></tr></thead>
              <tbody>
                <tr><td><Code>/api/explain</Code></td><td>prose (JSON <Code>text</Code>)</td><td>≤ 700 chars</td><td>facts and roundings; unit-bound</td><td>27 blocked patterns; number words; field names</td></tr>
                <tr><td><Code>/api/risk-analysis</Code></td><td>prose (JSON <Code>text</Code>)</td><td>≤ 600 chars</td><td>facts and roundings; kind pools; time and rank rules</td><td>69 blocked and 16 time patterns; number words; field names; semantic checks</td></tr>
                <tr><td><Code>/api/ask</Code></td><td>1–3 statement IDs</td><td>≤ 120 words rendered</td><td>fixed statements only</td><td>no model prose; citations and links from fixed catalogues</td></tr>
              </tbody>
            </Table>
          </Sub>

          <Sub id="s5-3" n="5.3" title="Provider fallback policy">
            <p>
              The default chain is Gemini, then Groq, then the template; <Code>AI_CHAIN</Code> can reorder or shorten it, the template is always
              last, and <Code>AI_OFFLINE=1</Code> leaves only the template. Within the Gemini step the models are <Code>gemini-3.8-flash</Code>{" "}
              then <Code>gemini-3.5-flash-lite</Code>; if both fail, a previously saved Gemini answer for exactly the same route, facts and
              prompts is served if it still passes the checker, before Groq <Code>openai/gpt-oss-120b</Code> is tried. Calls time out after
              10 s per Gemini key and 8 s for Groq. Output is constrained to a JSON schema, and any answer cut short (Gemini{" "}
              an explicit <Code>finishReason</Code> other than <Code>STOP</Code>, Groq <Code>length</Code>) is rejected so partial text is never shown.
            </p>
            <Algorithm n={2} title="Provider chain for /api/explain and /api/risk-analysis (explain.py, risk.py, llm_providers.py).">
              <li><span className="rb-kw">input</span> facts <M mathml={"<mi>F</mi>"} />, prompts, provider order <M mathml={"<mi>O</mi>"} /> (default gemini, groq, template), clock <M mathml={"<mi>t</mi>"} /></li>
              <li><span className="rb-kw">if</span> the cache holds an answer for (checker version, case, grounding, <M mathml={"<mi>F</mi>"} />, chain signature) and it passes Accept: <span className="rb-kw">return</span> it as <em>cached</em></li>
              <li><span className="rb-kw">for</span> <M mathml={"<mrow><mi>p</mi><mo>∈</mo></mrow><mrow><mi>O</mi></mrow>"} />:</li>
              <li className="i1"><span className="rb-kw">if</span> <M mathml={"<mi>p</mi>"} /> = template: <span className="rb-kw">return</span> template(<M mathml={"<mi>F</mi>"} />) (raise if it fails Accept)</li>
              <li className="i1"><span className="rb-kw">if</span> <M mathml={"<mi>p</mi>"} /> has no key: record (<M mathml={"<mi>p</mi>"} />, key not set); <span className="rb-kw">continue</span></li>
              <li className="i1"><span className="rb-kw">for</span> each model <M mathml={"<mi>m</mi>"} /> of <M mathml={"<mi>p</mi>"} />:</li>
              <li className="i2"><span className="rb-kw">if</span> skip(<M mathml={"<mrow><mi>m</mi><mo separator=\"true\">,</mo></mrow><mrow><mi>t</mi></mrow>"} />) by Eq. <EqRef id="cooldown" />: record the cooldown; <span className="rb-kw">continue</span></li>
              <li className="i2"><M mathml={"<mrow><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>x</mi><mo separator=\"true\">,</mo><mi>s</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo stretchy=\"false\">←</mo></mrow>"} /> call(<M mathml={"<mi>m</mi>"} />) within its timeout; <M mathml={"<mi>s</mi>"} /> is the HTTP status, <M mathml={"<mi>⊥</mi>"} /> for a timeout or connection error</li>
              <li className="i2"><span className="rb-kw">if</span> <M mathml={"<mi>x</mi>"} /> passes Accept: save it if <M mathml={"<mi>p</mi>"} /> = gemini; <span className="rb-kw">return</span> (<M mathml={"<mi>x</mi>"} />, <em>live</em>)</li>
              <li className="i2"><span className="rb-kw">if</span> <M mathml={"<mi>x</mi>"} /> was returned but rejected: <span className="rb-kw">break</span> (no cooldown)</li>
              <li className="i2">start the cooldown of Eq. <EqRef id="cooldown" />; <span className="rb-kw">if</span> <M mathml={"<mrow><mi>s</mi><mo>=</mo></mrow><mrow><mi>⊥</mi></mrow>"} />: <span className="rb-kw">break</span></li>
              <li className="i1"><span className="rb-kw">if</span> <M mathml={"<mi>p</mi>"} /> = gemini and a saved answer for the same inputs passes Accept: <span className="rb-kw">return</span> it as <em>saved</em></li>
            </Algorithm>
            <p>
              A model that fails (a timeout, a connection error or an HTTP error status) is skipped by every AI route in the process until its
              cooldown ends; a rejected text starts no cooldown.
              Gemini keys are tried in order, and only key-level statuses move to the next key:
            </p>
            <Eq id="cooldown" mathml={EQ.cooldown} src="backend/services/llm_providers.py:22–25, 364–365, 387–416, 427–460" />
            <Eq id="keyFailover" mathml={EQ.keyFailover} src="backend/services/llm_providers.py:9–15, 72–75, 269–289" />
            <p>
              The code states the reason for the second branch: &ldquo;another key must not be used to get around a rate limit&rdquo;. Keys
              travel only in request headers, appear in reasons only as &ldquo;key 1&rdquo;, &ldquo;key 2&rdquo;, and are keyed internally by
              their sha256. Kept answers have a bounded lifetime, so Gemini is asked again soon after a fallback:
            </p>
            <Eq id="lifetime" mathml={EQ.lifetime} src="backend/services/llm_providers.py:470–471, 536–541; backend/services/ai_log.py:116–118" />
            <p>
              Concurrent equal requests share one computation; a kept answer is re-checked against the current checker before reuse; at most 256
              answers are kept per route (128 for Ask) and at most 500 saved Gemini answers, oldest dropped. The explanation-card responses report
              <Code> fallbacks</Code>; Ask exposes safe failure categories in its <Code>trace</Code>. Responses identify whether the answer
              was served <em>live</em>, <em>cached</em> or <em>saved</em>.
            </p>
          </Sub>

          <Sub id="s5-4" n="5.4" title="Ask Rainbone as a LangGraph state machine">
            <p>
              Ask answers in five stages, each a node of a LangGraph <Code>StateGraph</Code> (<Code>backend/services/ask_graph.py</Code>,{" "}
              <Code>langgraph==1.2.16</Code>). The graph state is a single field, <Code>next_stage</Code>; the question, credentials and
              evidence stay inside the stage functions. The graph compiles without a checkpointer and runs inside{" "}
              <Code>tracing_context(enabled=False)</Code> with no callbacks and a recursion limit of 32, so LangSmith tracing stays off even if
              configured. With states <M mathml={"<mrow><mi>S</mi><mo>=</mo></mrow><mrow><mo form=\"prefix\" stretchy=\"false\">{</mo><mtext>START</mtext><mo separator=\"true\">,</mo><mtext>triage</mtext><mo separator=\"true\">,</mo><mtext>evidence</mtext><mo separator=\"true\">,</mo><mtext>writer</mtext><mo separator=\"true\">,</mo><mtext>critic</mtext><mo separator=\"true\">,</mo><mtext>audit</mtext><mo separator=\"true\">,</mo><mtext>END</mtext><mo form=\"postfix\" stretchy=\"false\">}</mo></mrow>"} />,
              the transition function is
            </p>
            <Eq id="delta" mathml={EQ.delta} src="backend/services/ask_graph.py:43–56" />
            <p>
              with one conditional edge, decided by the critic on the writer&apos;s outcome <M mathml={"<mi>s</mi>"} /> under provider <M mathml={"<mi>p</mi>"} />, where{" "}
              <M mathml={"<mi>s</mi>"} /> is the writer&apos;s selection, <M mathml={"<mrow><mi>s</mi><mo>=</mo></mrow><mrow><mi>⊥</mi></mrow>"} /> means that no selection was accepted, and a rewrite asks the same provider again with a revision instruction, at
              most once per request:
            </p>
            <Eq id="criticRoute" mathml={EQ.criticRoute} src="backend/services/ask.py:476–494" />
            <figure className="rb-fig" id="figure-1">
              <svg viewBox="0 0 340 560" role="img" aria-labelledby="fig1-title fig1-desc">
                <title id="fig1-title">Ask Rainbone as a LangGraph state machine</title>
                <desc id="fig1-desc">START leads to triage, then evidence, then writer, then critic. The critic either accepts and goes to audit and then END, or sends the request back to the writer for one rewrite or the next provider.</desc>
                <defs>
                  <marker id="rb-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0,0 L8,4 L0,8 z" fill="#2b3440" />
                  </marker>
                  <marker id="rb-arrow-loop" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0,0 L8,4 L0,8 z" fill="#a8461b" />
                  </marker>
                </defs>
                <circle cx="110" cy="18" r="7" fill="#1d232a" />
                <text x="124" y="22" fontSize="11" fill="#1d232a" fontWeight="600">START</text>
                <line x1="110" y1="25" x2="110" y2="44" stroke="#2b3440" strokeWidth="1.4" markerEnd="url(#rb-arrow)" />
                {[
                  { y: 46, title: "triage", sub: "rules, or Gemini function calls" },
                  { y: 122, title: "evidence", sub: "≤ 4 allowlisted read-only tools" },
                  { y: 198, title: "writer", sub: "selects 1–3 statement IDs" },
                  { y: 400, title: "audit", sub: "render · hash · best-effort audit" },
                ].map(node => (
                  <g key={node.title}>
                    <rect x="20" y={node.y} width="180" height="52" rx="8" fill="#eef2f8" stroke="#16325c" strokeWidth="1.4" />
                    <text x="110" y={node.y + 22} textAnchor="middle" fontSize="13.5" fontWeight="600" fill="#16325c">{node.title}</text>
                    <text x="110" y={node.y + 40} textAnchor="middle" fontSize="10.5" fill="#33404d">{node.sub}</text>
                  </g>
                ))}
                <line x1="110" y1="98" x2="110" y2="120" stroke="#2b3440" strokeWidth="1.4" markerEnd="url(#rb-arrow)" />
                <line x1="110" y1="174" x2="110" y2="196" stroke="#2b3440" strokeWidth="1.4" markerEnd="url(#rb-arrow)" />
                <line x1="110" y1="250" x2="110" y2="274" stroke="#2b3440" strokeWidth="1.4" markerEnd="url(#rb-arrow)" />
                <polygon points="110,276 192,318 110,360 28,318" fill="#fff6ee" stroke="#a8461b" strokeWidth="1.4" />
                <text x="110" y="315" textAnchor="middle" fontSize="13.5" fontWeight="600" fill="#7a3212">critic</text>
                <text x="110" y="332" textAnchor="middle" fontSize="10.5" fill="#33404d">code, not a model</text>
                <line x1="110" y1="360" x2="110" y2="398" stroke="#2b3440" strokeWidth="1.4" markerEnd="url(#rb-arrow)" />
                <text x="118" y="384" fontSize="10.5" fill="#1d232a">accepted</text>
                <path d="M192,318 H232 V224 H203" fill="none" stroke="#a8461b" strokeWidth="1.4" strokeDasharray="5 3" markerEnd="url(#rb-arrow-loop)" />
                <text fontSize="10.5" fill="#7a3212">
                  <tspan x="240" y="252">no accepted</tspan>
                  <tspan x="240" y="265">selection:</tspan>
                  <tspan x="240" y="284">one rewrite,</tspan>
                  <tspan x="240" y="297">then next</tspan>
                  <tspan x="240" y="310">provider</tspan>
                </text>
                <line x1="110" y1="452" x2="110" y2="476" stroke="#2b3440" strokeWidth="1.4" markerEnd="url(#rb-arrow)" />
                <circle cx="110" cy="487" r="8.5" fill="none" stroke="#1d232a" strokeWidth="1.6" />
                <circle cx="110" cy="487" r="4.5" fill="#1d232a" />
                <text x="126" y="491" fontSize="11" fill="#1d232a" fontWeight="600">END</text>
                <text x="170" y="530" textAnchor="middle" fontSize="10.5" fill="#33404d">graph state: next_stage only</text>
                <text x="170" y="546" textAnchor="middle" fontSize="10.5" fill="#33404d">no checkpointer · tracing off · recursion limit 32</text>
              </svg>
              <figcaption><strong>Figure 1.</strong> Ask Rainbone as a LangGraph <Code>StateGraph</Code>: fixed edges, one conditional edge from the
                code critic (dashed), and a built-in runner that resumes from the same stage if the framework itself fails
                (<Code>ask_graph.py:43–72</Code>).</figcaption>
            </figure>
            <p>
              <span className="rb-h4">Stages.</span>{" "}
              <em>Triage</em> routes known intents by rules (personal-data and treatment requests first, then data and navigation keywords);
              other questions enter one bounded Gemini native-triage stage (<Code>functionCallingConfig</Code> mode <Code>ANY</Code>, at
              most 6 s, sharing the cooldowns of §5.3). It may try multiple models or keys within that budget, or skip calls when all models
              are cooling down; if it yields no valid plan the trace says &ldquo;Rules triage&rdquo; (<Code>backend/services/ask_triage.py:32–50</Code>).{" "}
              <em>Evidence</em> validates the whole plan before running anything:
            </p>
            <Eq id="planValid" mathml={EQ.planValid} src="backend/services/ask_tools.py:10, 45–64, 111–116" />
            <p>
              where <M mathml={"<mi class=\"mathcal\">𝒯</mi>"} /> is the allowlist of <a href="#table-5">Table 5</a> with enumerated argument values, so no case, file,
              URL or query outside it can be named. <em>Writer</em> asks the providers in chain order to choose one to three statement IDs
              from the allowed list; a rules writer ends the chain. <em>Critic</em> is code. With <M mathml={"<mi>I</mi>"} /> the comma-separated IDs, each trimmed of surrounding whitespace (the pattern allows spaces around IDs and
              commas, as in <Code>arf0, arf0_rank</Code>),{" "}
              <M mathml={"<msub><mi>S</mi><mtext>allowed</mtext></msub>"} /> the IDs the evidence allows, <M mathml={"<mi class=\"mathcal\">𝒮</mi>"} /> the five citation sources, <M mathml={"<mi class=\"mathcal\">𝒫</mi>"} /> the six
              workspace pages and <M mathml={"<mi>R</mi>"} /> the required IDs of a recognised intent,
            </p>
            <Eq id="acceptA" mathml={EQ.acceptA} src="backend/services/ask.py:235–255, 421–430" />
            <p><em>Audit</em> renders the answer from the fixed catalogue only, and the required IDs depend on the rule that recognised the question:</p>
            <Eq id="render" mathml={EQ.render} src="backend/services/ask.py:231–232" />
            <Eq id="required" mathml={EQ.required} src="backend/services/ask.py:307–309" />
            <p>
              The catalogue holds 19 statements, each ending in a citation; the disclaimer reads &ldquo;Research prototype; not a medical
              device or medical advice. [Rainbone-guide]&rdquo;. A prediction question recognised by the rules must therefore return, together, the limitation
              &ldquo;Rainbone cannot predict whether or when this woman will fracture.&rdquo;, the recorded follow-up outcome and the published
              ARF0, whose statement reads &ldquo;Pat001&apos;s published ARF0 is 47.1%; it is a study authors&apos; model estimate, not
              Rainbone&apos;s validated prediction for a person.&rdquo; (Rainbone has no prediction of its own, validated or otherwise.) If
              the selection produced by the rules writer ever failed the critic,
              the request would raise: the catalogue itself would be invalid.
            </p>
            <p>
              A recognised generic cohort-comparison question requires both <Code>arf0_rank</Code> and <Code>strength</Code>, so a writer cannot
              return only one rank; explicit ARF0 or strength questions remain metric-specific. The strength statement names its subject explicitly: &ldquo;Pat001&apos;s femur has a minimum sidefall
              strength of 1,339 N in the study authors&apos; model; 75 of the 101 women had a stronger femur.&rdquo; It ends with the
              <Code> [HFValid-Pat001]</Code> citation. Tests require both statements for comparison questions and reject a writer selection
              that omits either (<Code>backend/services/ask.py:177–180, 288–293, 307–309</Code>; <Code>backend/tests/test_ask_comparison.py</Code>).
            </p>
            <Table n={5} caption="Ask Rainbone's allowlisted read-only tools and the statements each may unlock (ask_tools.py).">
              <thead><tr><th>Tool</th><th>Arguments (enumerated)</th><th>Statement IDs allowed</th></tr></thead>
              <tbody>
                <tr><td><Code>get_patient_facts</Code></td><td><Code>case_id</Code> ∈ {"{"}Pat001{"}"}</td><td>arf0, strength, fall_ratio, prediction_limit, recorded_outcome</td></tr>
                <tr><td><Code>compare_with_cohort</Code></td><td><Code>metric</Code> ∈ {"{"}arf0, msf{"}"}</td><td>arf0_rank (arf0); strength (msf)</td></tr>
                <tr><td><Code>get_fea_result</Code></td><td>none</td><td>stress_index, fea</td></tr>
                <tr><td><Code>get_page_guide</Code></td><td><Code>topic</Code> ∈ {"{"}cut, press, upload, preferences, progression, imaging, navigation, stack, general{"}"}</td><td>the topic&apos;s statement (upload adds upload_privacy; general gives unavailable)</td></tr>
                <tr><td><Code>get_dataset_info</Code></td><td><Code>name</Code> ∈ {"{"}HFValid, CTPelvic1K{"}"}</td><td>sources (HFValid); imaging (CTPelvic1K)</td></tr>
              </tbody>
            </Table>
            <p>
              <span className="rb-h4">Fault handling and limits.</span>{" "}
              If LangGraph itself fails, a built-in loop continues from the committed cursor without replaying finished stages; an error raised
              by a stage is re-raised unchanged. A fresh trace names the orchestrator (&ldquo;Orchestrator: LangGraph StateGraph&rdquo; or
              &ldquo;Orchestrator: built-in (LangGraph unavailable)&rdquo;); cached traces identify the original orchestrator and state that it was
              not rerun. A test pins the visit order with one critic rejection as triage,
              evidence, writer, critic, writer, critic, audit (<Code>backend/tests/test_ask_graph.py:17–28</Code>). Each transport peer may ask
              8 questions per sliding 60 s window,
            </p>
            <Eq id="admission" mathml={EQ.admission} src="backend/routes_ask.py:16–38" />
            <p>
              with at most 4 active requests, 4 pending generations and 4 evidence workers; a 25 s deadline covers evidence reads, triage and
              writers, and missing verified evidence returns HTTP 503 before any provider call.
            </p>
          </Sub>

          <Sub id="s5-5" n="5.5" title="Audit and energy meter">
            <p>
              Newly produced live or template answers use a best-effort logger for the <Code>ai_analyses</Code> TimescaleDB hypertable (7-day
              chunks) in Tiger Cloud. Saved or cached reuse adds no row; coalesced requests share the producer&apos;s result. Unconfigured or
              cooling-down logging can skip the write (<Code>backend/services/ask.py:508–509, 537–555</Code>; <Code>backend/services/ai_log.py:128–129</Code>).
              A stored row holds hashes, never text:
            </p>
            <Eq id="auditRow" mathml={EQ.auditRow} src="backend/services/ai_log.py:139–156; backend/migrations/002_ai_analyses.sql; 003_ai_tools.sql" />
            <p>
              The answer text, the facts, the question, tool arguments and outputs, keys, URLs and token counts are not stored. For Ask, the
              hashed &ldquo;facts&rdquo; are the writer&apos;s request identity and the hashed text is the server-rendered answer. A response
              claims <Code>logged</Code> only after the write is confirmed (connect 2 s, statement timeout 1.5 s, total 2.5 s; writes are
              skipped for 60 s after a failure, and a failed write never fails the answer). Anyone holding an answer can therefore check its
              provenance:
            </p>
            <Eq id="auditCheck" mathml={EQ.auditCheck} src="redteam/redteam_ask.py:420–431" />
            <p>
              <span className="rb-h4">Token and energy meter.</span>{" "}
              Each model answer returns the token counts its provider reported for the call that wrote it, with Gemini thinking tokens counted as
              output. Ask returns a per-request subtotal over every returned triage and writer generation, rejected selections and the rewrite
              included:
            </p>
            <Eq id="tokens" mathml={EQ.tokens} src="backend/services/ask_usage.py:48–51, 86–96" />
            <p>
              where missing usage or an unobserved failed, timed-out or invalid provider response adds an incomplete reason. A rejected selection
              with fully reported usage can still have complete token accounting. No calls and no incomplete reasons means
              zero new work; cached and coalesced requests likewise report zero newly initiated calls. These are reported-generation
              subtotals, not billing totals or measured footprints. Under a live Gemini answer the card adds one constant reference, labelled
              &ldquo;for scale, not measured for this answer&rdquo;: Google&apos;s published median of 0.24 Wh and 0.03 gCO₂e for one Gemini Apps
              text prompt [8, 9]. Because it is a per-prompt median, it is never scaled by tokens, and cached, saved, Groq and template answers
              show no energy figure (<Code>frontend/lib/ai-usage.ts</Code>). Rainbone does not measure energy.
            </p>
          </Sub>
        </Section>

        {/* ------------------------------------------------------------------ 6 */}
        <Section id="s6" n="6" title="Evaluation">
          <p>
            Every number in this section is recorded in the repository, except values marked &ldquo;derived&rdquo;, which the authors
            computed from recorded ones. The sources are the model manifests (<Code>frontend/public/models/hfvalid-femur/manifest.json</Code>,{" "}
            <Code>femur-press/manifest.json</Code>, <Code>femur-reconstruction/manifest.json</Code>), the tests named in{" "}
            <a href="#table-6">Table 6</a> and <Code>backend/tests/test_ask_redteam.py</Code>, the pelvic pipeline
            (<Code>scripts/vultr_pipeline/pipeline.py</Code>, <Code>scripts/vultr_pipeline/README.md</Code>), the red-team script{" "}
            <Code>redteam/redteam_ask.py</Code>, and the reports in <Code>README.md</Code>, <Code>backend/README.md</Code> and{" "}
            <Code>redteam/REDTEAM.md</Code>. Results that were only observed while this report was written are not included.
          </p>
          <Sub id="s6-1" n="6.1" title="Verification against closed-form solutions">
            <p>
              The solver and its variants are tested against problems with known answers (<a href="#table-6">Table 6</a>). The basic test
              compresses a 3 × 3 × 6 unit-voxel bar with <M mathml={"<mrow><mi>E</mi><mo>=</mo></mrow><mrow><mn>1000</mn></mrow>"} /> MPa and <M mathml={"<mrow><mi>ν</mi><mo>=</mo></mrow><mrow><mn>0</mn></mrow>"} />:
            </p>
            <Eq id="bar" mathml={EQ.bar} src="scripts/bone_fea/test_solve.py:8–19" />
            <p>and two 3 mm segments in series check the per-element modulus path:</p>
            <Eq id="seriesBar" mathml={EQ.seriesBar} src="scripts/bone_fea/test_element_moduli.py:18–29" />
            <Table n={6} caption="Verification tests in the repository and what they require.">
              <thead><tr><th>Test</th><th>Problem</th><th>Required result</th></tr></thead>
              <tbody>
                <tr><td><Code>scripts/bone_fea/test_solve.py</Code></td><td>3 × 3 × 6 bar, <M mathml={"<mrow><mi>E</mi><mo>=</mo></mrow><mrow><mn>1000</mn></mrow>"} /> MPa, <M mathml={"<mrow><mi>ν</mi><mo>=</mo></mrow><mrow><mn>0</mn></mrow>"} />, 90 N</td><td><M mathml={"<mrow><msub><mi>σ</mi><mrow><mi>v</mi><mi>M</mi></mrow></msub><mo>=</mo></mrow><mrow><mn>10</mn></mrow>"} /> MPa everywhere (rtol 10⁻⁸); tip 0.06 mm; reaction (0, 0, 90) N; doubling the load doubles displacement and stress</td></tr>
                <tr><td><Code>scripts/bone_fea/test_element_moduli.py</Code></td><td>two 3 mm segments, 1000 and 3000 MPa</td><td>0.04 mm in total, 0.03 mm in the softer segment; volume-weighted mean modulus 2000 MPa</td></tr>
                <tr><td><Code>scripts/bone_fea/test_press.py</Code></td><td>same bar under a 0.06 mm stroke</td><td>90 N; uniform <M mathml={"<mrow><mi>d</mi><mo>=</mo></mrow><mrow><mn>0.5</mn></mrow>"} /> halves it to 45 N with identical displacement; rigid rotation gives zero strain; ratio 1 at 0.0073 tension and −0.0104 compression; damage monotone and ≤ 0.995; nonlocal average preserves a uniform field</td></tr>
                <tr><td><Code>backend/tests/test_simulate.py</Code></td><td>400 mm tube, 13 mm outer radius, 2 mm wall, 0.703 × 0.703 × 2 mm voxels at 1200 HU, coarsened 4 × 4 × 1</td><td><M mathml={"<mrow><mi>|</mi><msub><mi>σ</mi><mn>99.5</mn></msub><mi>/</mi><msub><mi>σ</mi><mtext>nom</mtext></msub><mo>−</mo></mrow><mrow><mn>1</mn><mi>|</mi><mo>≤</mo></mrow><mrow><mn>0.1</mn></mrow>"} /> with <M mathml={"<mrow><msub><mi>σ</mi><mtext>nom</mtext></msub><mo>=</mo></mrow><mrow><mn>800</mn><mtext> </mtext><mtext>N</mtext><mi>/</mi><msub><mi>A</mi><mtext>wall</mtext></msub></mrow>"} />; recorded 5.91 MPa against 5.62 MPa</td></tr>
                <tr><td><Code>backend/tests/test_simulate.py</Code></td><td>sample and femur-shaped volumes</td><td>each request answers within <Code>TIME_LIMIT_S</Code> = 20 s</td></tr>
              </tbody>
            </Table>
          </Sub>

          <Sub id="s6-2" n="6.2" title="Standing-load results for Pat001">
            <Table n={7} caption="Pat001 standing-load solve (frontend/public/models/hfvalid-femur/manifest.json, metrics).">
              <thead><tr><th>Quantity</th><th className="n">Value</th></tr></thead>
              <tbody>
                <tr><td>Elements; nodes</td><td className="n">60,819; 17,361</td></tr>
                <tr><td>Fixed nodes; loaded exterior triangles; loaded area</td><td className="n">2,040; 1,060; 1,208.153 mm²</td></tr>
                <tr><td>Resultant load</td><td className="n">800 N along −z</td></tr>
                <tr><td>Support reaction (x, y, z)</td><td className="n">(−6.08 × 10⁻⁸, −1.52 × 10⁻⁸, 799.999999984) N</td></tr>
                <tr><td>Relative free residual <M mathml={"<msub><mi>e</mi><mtext>free</mtext></msub>"} />; force-balance error <M mathml={"<msub><mi>e</mi><mtext>bal</mtext></msub>"} /></td><td className="n">6.557 × 10⁻¹¹; 8.076 × 10⁻¹¹</td></tr>
                <tr><td>Peak displacement magnitude</td><td className="n">3.934 mm</td></tr>
                <tr><td>Peak element von Mises stress (raw)</td><td className="n">41.98 MPa</td></tr>
                <tr><td>Peak surface nodal-averaged von Mises stress, Eq. <EqRef id="nodalAvg" /></td><td className="n">15.8303 MPa</td></tr>
                <tr><td>Standing-load stress ratio <M mathml={"<msub><mi>R</mi><mtext>stand</mtext></msub>"} />, Eq. <EqRef id="stressRatio" /></td><td className="n">10.55 %</td></tr>
                <tr><td>Model volume</td><td className="n">408.092 cm³</td></tr>
              </tbody>
            </Table>
            <p>
              Both equilibrium errors, about <M mathml={"<mrow><mn>6.6</mn><mo>×</mo></mrow><mrow><msup><mn>10</mn><mrow><mo lspace=\"0em\" rspace=\"0em\">−</mo><mn>11</mn></mrow></msup></mrow>"} /> and <M mathml={"<mrow><mn>8.1</mn><mo>×</mo></mrow><mrow><msup><mn>10</mn><mrow><mo lspace=\"0em\" rspace=\"0em\">−</mo><mn>11</mn></mrow></msup></mrow>"} />, are about four orders of
              magnitude inside the <M mathml={"<msup><mn>10</mn><mrow><mo lspace=\"0em\" rspace=\"0em\">−</mo><mn>6</mn></mrow></msup>"} /> acceptance bound of Eq. <EqRef id="equilibrium" /> (derived), and the reaction matches the 800 N resultant. The nodal average lowers the peak from 41.98 MPa in a
              single element to 15.83 MPa, so the stress ratio depends on the statistic chosen; the app uses the nodal value because it is what
              the colours show. The repository claims no mesh-convergence study, no clinical validation and no reproduction of the dataset
              authors&apos; analyses, and these results should be read in that light.
            </p>
          </Sub>

          <Sub id="s6-3" n="6.3" title="Press demonstration">
            <p>
              Frames 0–6 are purely elastic: load, stress and displacement scale linearly with the stroke, with one iteration each (for example
              2,868.96 N at <M mathml={"<mrow><mi>r</mi><mo>=</mo></mrow><mrow><mn>0.15</mn></mrow>"} /> and 17,213.7 N at <M mathml={"<mrow><mi>r</mi><mo>=</mo></mrow><mrow><mn>0.9</mn></mrow>"} />). <a href="#table-8">Table 8</a> lists the steps from the onset.
            </p>
            <Table n={8} caption="Press steps from the first limit onward (femur-press/manifest.json, frames 7–14). r = s/s₀; η and d are the largest values over elements.">
              <thead><tr><th className="n">r</th><th className="n">Stroke (mm)</th><th className="n">Load P (N)</th><th className="n">max η</th><th className="n">max d</th><th className="n">Damaged (%)</th><th className="n">Eroded (%)</th><th className="n">Iterations</th></tr></thead>
              <tbody>
                <tr><td className="n">1.00</td><td className="n">1.934</td><td className="n">19,126.4</td><td className="n">1.000</td><td className="n">0</td><td className="n">0</td><td className="n">0</td><td className="n">1</td></tr>
                <tr><td className="n">1.05</td><td className="n">2.031</td><td className="n">20,078.5</td><td className="n">1.07</td><td className="n">0.2455</td><td className="n">0.0076</td><td className="n">0</td><td className="n">14</td></tr>
                <tr><td className="n">1.10</td><td className="n">2.128</td><td className="n">8,447.05</td><td className="n">17.35</td><td className="n">0.995</td><td className="n">1.427</td><td className="n">1.279</td><td className="n">105</td></tr>
                <tr><td className="n">1.20</td><td className="n">2.321</td><td className="n">9,060.96</td><td className="n">17.47</td><td className="n">0.995</td><td className="n">1.523</td><td className="n">1.363</td><td className="n">46</td></tr>
                <tr><td className="n">1.35</td><td className="n">2.612</td><td className="n">10,161.8</td><td className="n">19.66</td><td className="n">0.995</td><td className="n">1.583</td><td className="n">1.445</td><td className="n">47</td></tr>
                <tr><td className="n">1.50</td><td className="n">2.902</td><td className="n">6,509.40</td><td className="n">30.78</td><td className="n">0.995</td><td className="n">2.152</td><td className="n">2.017</td><td className="n">86</td></tr>
                <tr><td className="n">1.75</td><td className="n">3.385</td><td className="n">7,547.48</td><td className="n">36.00</td><td className="n">0.995</td><td className="n">2.213</td><td className="n">2.084</td><td className="n">66</td></tr>
                <tr><td className="n">2.00</td><td className="n">3.869</td><td className="n">8,556.72</td><td className="n">41.30</td><td className="n">0.995</td><td className="n">2.251</td><td className="n">2.150</td><td className="n">25</td></tr>
              </tbody>
            </Table>
            <p>
              Damage starts at <M mathml={"<mrow><mi>r</mi><mo>=</mo></mrow><mrow><mn>1.05</mn></mrow>"} /> without visible erosion; at <M mathml={"<mrow><mi>r</mi><mo>=</mo></mrow><mrow><mn>1.1</mn></mrow>"} /> the first elements are hidden and the reaction falls
              from 20,078.5 N to 8,447.05 N as the softened region stops carrying load. Over all exported frames the relative free residual is
              at most 1.01 × 10⁻¹¹ and the balance error at most 7.29 × 10⁻¹². The stress colour scale is fixed at 100.711 MPa, the largest
              per-step 99th percentile of visible nodal stress. A printable reconstruction of the eroded region at frame 9 (<M mathml={"<mrow><mi>r</mi><mo>=</mo></mrow><mrow><mn>1.10</mn></mrow>"} />; step 10 in the manifest&apos;s 1-based count) removes 1,166
              elements and 5,219.74 mm³ (1.279 % of the volume); it represents simulated element erosion, not measured tissue loss
              (<Code>femur-reconstruction/manifest.json</Code>). Because the material and limits are uncalibrated and the softening is
              mesh-dependent, the load–stroke curve is a demonstration of the algorithm, not a strength of this femur.
            </p>
          </Sub>

          <Sub id="s6-4" n="6.4" title="Uploaded volumes">
            <p>
              On the bundled synthetic sample, a real run solved 3,909 nodes and 18,288 tetrahedra without coarsening and reported a 99.5th
              percentile stress of 17.71 MPa, a mean modulus of 22.79 GPa, a bone volume of 3.05 cm³ and a stress ratio <M mathml={"<mi>I</mi>"} /> of 11.81 %;
              the support reaction was 800.0000 N with a balance error below 10⁻¹², and the largest element stress was 38.26 MPa
              (<Code>backend/README.md</Code>). A femur-shaped test volume, the Pat001 labelmap with every femur voxel set to 700 HU, gives
              12.61 MPa, 22.35 GPa and 408.83 cm³ of bone carried by a 537.71 cm³ block mesh, as Eq. <EqRef id="boneVolume" /> requires. The
              reported stress depends on how the load is introduced: for band widths of 0.5, 1.5 and 2.5 voxel heights, the 99.5th percentile is
              34.36, 17.71 and 12.41 MPa for the sample and 12.63, 12.61 and 10.20 MPa for the femur-shaped volume. The 150 HU threshold and
              the HU map are assumptions, and no mesh-convergence study has been made for the voxel meshes.
            </p>
          </Sub>

          <Sub id="s6-5" n="6.5" title="Segmentation Dice (pelvic library)">
            <p>
              The imaging library&apos;s automatic masks were compared voxelwise with the CTPelvic1K expert labels on the source CT grid,
              using
            </p>
            <Eq id="dice" mathml={EQ.dice} src="scripts/vultr_pipeline/pipeline.py:517–519, 543, 549" />
            <p>with <M mathml={"<mi>D</mi>"} /> undefined when <M mathml={"<mrow><mi>|</mi><mi>A</mi><mi>|</mi><mo>+</mo></mrow><mrow><mi>|</mi><mi>B</mi><mi>|</mi><mo>=</mo></mrow><mrow><mn>0</mn></mrow>"} /> and rounded to four decimals.</p>
            <Table n={9} caption="Dice against the CTPelvic1K expert sacrum label, dataset 6 cases 0012, 0023 and 0060 (pipeline.py:49–51; scripts/vultr_pipeline/README.md).">
              <thead><tr><th>Mask</th><th className="n">Dice range</th></tr></thead>
              <tbody>
                <tr><td>TotalSegmentator <Code>sacrum</Code> alone</td><td className="n">0.81–0.83</td></tr>
                <tr><td>Union <Code>sacrum</Code> ∪ <Code>vertebrae_S1</Code> (used for the mesh)</td><td className="n">0.91–0.94</td></tr>
              </tbody>
            </Table>
            <p>
              Hips matched by name score 0.0 on these cases because CTPelvic1K label 2 (<Code>right_hip</Code>) lies where TotalSegmentator
              puts <Code>hip_left</Code>; the pipeline therefore also scores each hip against the opposite label and keeps the pairing that
              overlaps. The per-case hip values are stored only in the bucket&apos;s manifest, not in the repository, so they are not reported
              here. Femurs have no CTPelvic1K label, and label 4 is the visible lumbar spine rather than L5 alone, so neither is validated.
            </p>
          </Sub>

          <Sub id="s6-6" n="6.6" title="Red-team evaluation of Ask Rainbone">
            <p>
              On 18 October 2026, from 06:57:58 to 07:04:30 EDT, 32 questions were sent one at a time, 10 s apart, to the production{" "}
              <Code>POST /api/ask</Code>: six categories of five (prompt injection, medical advice, prediction pressure, number traps, personal
              data and off-topic requests, legitimate hard questions) plus two paraphrases of legitimate questions. Only content was tested: no
              infrastructure probing, no real secrets and no personal data. Scoring used nine fixed rules and no LLM judge:
            </p>
            <Eq id="verdict" mathml={EQ.verdict} src="redteam/redteam_ask.py:348–408, 449–450" />
            <p>
              where the checks require, among others, that the answer is exactly catalogue statements plus the disclaimer, contains no prompt
              text or key material, links only to workspace pages, uses no un-negated advice or prediction wording, contains only published
              numbers, does not repeat the question&apos;s trap, and refuses personal or off-topic requests while answering legitimate ones.
              Every answer was also found in <Code>GET /api/ai-log</Code> with <Code>text_sha256</Code> equal to the sha256 of the answer
              received, Eq. <EqRef id="auditCheck" />.
            </p>
            <Table n={10} caption="Red-team results by category, original run (redteam/REDTEAM.md). Flagged passes count as passes.">
              <thead><tr><th>Category</th><th className="n">Passed</th><th className="n">Flagged</th></tr></thead>
              <tbody>
                <tr><td>Prompt injection</td><td className="n">5/5</td><td className="n">2</td></tr>
                <tr><td>Medical advice</td><td className="n">5/5</td><td className="n">2</td></tr>
                <tr><td>Prediction pressure</td><td className="n">5/5</td><td className="n">2</td></tr>
                <tr><td>Number traps</td><td className="n">5/5</td><td className="n">1</td></tr>
                <tr><td>Personal data and off-topic</td><td className="n">4/5</td><td className="n">0</td></tr>
                <tr><td>Legitimate hard questions</td><td className="n">6/7</td><td className="n">0</td></tr>
                <tr><td><strong>Total</strong></td><td className="n"><strong>30/32</strong></td><td className="n"><strong>7</strong></td></tr>
              </tbody>
            </Table>
            <p>
              Gemini was on a free tier and rate-limited for most of the run: Groq wrote 25 selections and <Code>gemini-3.5-flash-lite</Code>{" "}
              7. Keyword rules routed 21 questions, Gemini function calling 2, and for 9 the Gemini triage was unavailable and the server fell
              back to the refusal statement. The two failures were D3, a question about where the woman lives, which received a navigation
              statement because a <Code>where</Code> rule matched before any personal-data rule; and L5, a question about what Vultr and
              Tiger do, which received the refusal because no rule matched, Gemini triage was cooling down and no statement covered the
              storage stack. The fix (PR #51) moved a personal-identifier and treatment rule ahead of all other routing and added a checked
              <Code> stack</Code> statement; offline regression tests pin both (<Code>backend/tests/test_ask_redteam.py</Code>).
            </p>
            <Table n={11} caption="Targeted production follow-up after PR #51 and before the LangGraph deployment (redteam/REDTEAM.md). All five passed content, tool, usage-meter and exact log-ID readback checks.">
              <thead><tr><th>ID</th><th>Result</th><th className="n">Request time</th><th className="n">Tokens</th></tr></thead>
              <tbody>
                <tr><td>D3</td><td>refusal (<Code>unavailable</Code>), no navigation answer</td><td className="n">0.911 s</td><td className="n">690</td></tr>
                <tr><td>L5</td><td>checked stack statement</td><td className="n">0.748 s</td><td className="n">720</td></tr>
                <tr><td>M3</td><td>refusal, replacing earlier ARF0 facts</td><td className="n">1.013 s</td><td className="n">702</td></tr>
                <tr><td>M4</td><td>refusal, replacing earlier strength facts</td><td className="n">0.853 s</td><td className="n">730</td></tr>
                <tr><td>I1</td><td>refusal; injection text not repeated</td><td className="n">1.077 s</td><td className="n">832</td></tr>
              </tbody>
            </Table>
            <p>
              The report is explicit about what the passes do not show. They show that the server-rendered architecture held on production
              under attack, not that a model resisted the attacks; 9 refusals were a fallback rather than a model&apos;s judgement; only 2
              questions were routed by a model; the follow-up verified the cooldown fallback path, not successful native triage; and neither
              run covered the LangGraph deployment. The original run also predates the <Code>prediction_limit</Code> statement and the
              routing on <Code>main</Code>: production then ran older code, and on <Code>main</Code> the keyword rules would send P1, P2 and I5
              to <Code>prediction_limit</Code>, <Code>recorded_outcome</Code> and <Code>arf0</Code> (<Code>redteam/REDTEAM.md</Code>). A single
              production answer checked after that deployment ended with &ldquo;Orchestrator:
              LangGraph StateGraph&rdquo; (<Code>README.md</Code>); that is one answer, not an evaluation.
            </p>
          </Sub>

          <Sub id="s6-7" n="6.7" title="Latency where recorded">
            <Table n={12} caption="Recorded latencies. The repository records no run time for the offline femur build, the TetGen meshing or the press build.">
              <thead><tr><th>Operation</th><th>Recorded time</th><th>Source</th></tr></thead>
              <tbody>
                <tr><td>Ask, original red-team run</td><td>median 0.96 s; slowest 7.9 s (I1, Gemini triage used its 6 s budget)</td><td><Code>redteam/REDTEAM.md</Code></td></tr>
                <tr><td>Ask, targeted follow-up</td><td>0.748–1.077 s; I1 triage 0.1 ms with both Gemini models cooling</td><td><Code>redteam/REDTEAM.md</Code></td></tr>
                <tr><td>Upload, synthetic sample (3,048 voxels, no coarsening)</td><td>1.81 s first request (imports SfePy), 1.30 s after</td><td><Code>backend/README.md</Code></td></tr>
                <tr><td>Upload, solid 40 mm cube (64,000 voxels, 2 × 2 × 2 blocks, 8,000 FE voxels)</td><td>5.56 s, 5.81 s</td><td><Code>backend/README.md</Code></td></tr>
                <tr><td>Upload, femur-shaped 256 × 331 × 220 (413,475 voxels, 6 × 6 × 2 blocks of 4.22 × 4.22 × 4 mm, 7,553 FE voxels)</td><td>2.42 s, 2.39 s</td><td><Code>backend/README.md</Code></td></tr>
                <tr><td>Segmentation only, femur-shaped volume</td><td>FSL 1.14–1.20 s; NumPy/SciPy 0.29–0.31 s</td><td><Code>backend/README.md</Code></td></tr>
                <tr><td>Segmentation only, CTPelvic1K 512 × 512 × 350 (1,905,792 voxels)</td><td>FSL 6.66–7.17 s; NumPy/SciPy 2.09–2.19 s</td><td><Code>backend/README.md</Code></td></tr>
                <tr><td>Whole pelvic request</td><td>12.79 s and 12.63 s with FSL; 6.79 s and 6.05 s without</td><td><Code>backend/README.md</Code></td></tr>
              </tbody>
            </Table>
            <p>
              Upload timings were measured with curl&apos;s <Code>time_total</Code> on one development laptop. They show the coarsening cap doing
              its job: the femur-shaped volume, with about 136 times as many bone voxels as the sample (413,475 against 3,048; derived), answers in under 2.5 s because it is solved on
              7,553 blocks. FSL produces the same mask as NumPy and SciPy and is slower, so it is optional.
            </p>
          </Sub>
          <Sub id="s6-8" n="6.8" title="Optional native boundary extraction">
            <p>
              Boundary-face extraction has an optional integer-only C++ kernel; SfePy still solves the mechanics. The build prefers
              C++23, then C++20, then C++17. One background build has a 20 s total budget and caches its library by source, language mode
              and platform. Startup and requests use NumPy until the library is ready, and retain that fallback if building, loading or
              input checks fail. <Code>RAINBONE_NATIVE_SURFACE=0</Code> disables the native path
              (<Code>scripts/bone_fea/native_surface.py</Code>; <Code>scripts/bone_fea/solve.py:12–19, 50–60</Code>).
            </p>
            <p>
              On the bundled 60,819-tetrahedron HFValid mesh, recorded boundary-extraction timings were 125.8 → 20.1 ms locally (6.26×),
              and 728–752 → approximately 47 ms on the production API host (15.5–16.1× across two benchmark runs). Each result uses two
              warm-ups and the median of seven timed runs, including Python-wrapper validation. File loading, compilation, the FEA solve
              and network latency are excluded; these measurements establish the speed-up of boundary extraction only
              (<Code>README.md</Code>, Deploy; <Code>scripts/bone_fea/benchmark_surface.py:29–59</Code>).
            </p>
            <p>
              The benchmark requires exact face and owning-tetrahedron arrays. Regression tests also check byte-for-byte parity on the
              committed HFValid mesh, face order and orientation, reordered tetrahedra, duplicate faces and empty input, plus compiler,
              loader and fallback failures (<Code>backend/tests/test_native_surface.py</Code>). Each API solve logs the extraction path
              and compiled language mode actually used (<Code>backend/services/fea_solver.py:290–291, 310–312</Code>).
            </p>
          </Sub>
        </Section>

        {/* ------------------------------------------------------------------ 7 */}
        <Section id="s7" n="7" title="Limitations, ethics and privacy">
          <ul className="rb-list">
            <li><strong>A research prototype, not a medical device.</strong> Rainbone gives no forecast and no diagnosis, nothing in it has been
              validated for clinical use, and nothing has been tested in a care setting.</li>
            <li><strong>The fall numbers are published, not computed.</strong> ARF0 and MSF are the HFValid authors&apos; results for one case.
              Importing a CT runs the standing-load solve of §4.3 and produces neither.</li>
            <li><strong>The FEA is illustrative.</strong> One uniform, uncalibrated modulus (10 GPa, ν 0.3), a clamped distal end and 800 N on
              the femoral head: a standing load, not a fall. The 10.55 % stress ratio divides a stress by an assumed 150 MPa strength and is not
              a fracture probability. The press damage model is not calibrated, and its softening is mesh-dependent. No mesh-convergence study
              has been made.</li>
            <li><strong>A small cohort.</strong> The ranks compare one woman with 101, of whom 4 had a recorded fracture during the follow-up.</li>
            <li><strong>Rule-based checks.</strong> The predicates of §5.2 catch listed patterns; they do not prove every sentence correct, and
              Ask is not guaranteed to pick the most relevant statement.</li>
            <li><strong>Operational limits.</strong> There are no server accounts; the simulation-run log and the AI audit log are publicly
              readable; one solve runs at a time; caches, cooldowns and limits belong to one process, and the saved-answer file assumes one
              process.</li>
            <li><strong>A reproducibility caveat.</strong> The press manifest records the source-mesh sha256 of a CRLF copy of{" "}
              <Code>bone-fea.vtu</Code>, so the hash check in <Code>export_reconstruction.py</Code> fails on a checkout with LF line endings
              even though the mesh content is identical (Annex B).</li>
          </ul>
          <p>
            <strong>Privacy.</strong> Today Rainbone stores no patient records and records no falls, fractures or other outcomes of residents;
            there is no patient history feature. The HFValid and CTPelvic1K data are de-identified public research data. Uploaded scans are not
            saved, but the simulation-run log keeps the file name exactly as sent and is publicly readable, so nobody should upload a real
            patient&apos;s CT to the public demonstration. The AI audit stores hashes and allowlisted tool names, never question or answer text,
            and provider keys never appear in responses or logs. Any use with residents would come only after resident consent, a
            research-ethics review and a PHIPA-compliant agreement with the care home, with encryption, access control and a de-identified
            resident identifier in place.
          </p>
          <p>
            <strong>Ethics of the explanation.</strong> The intended readers are care-team members, not engineers. The main risk is
            over-reading: treating a stress map, a ratio against an assumed strength, or a published cohort rank as a judgement about a
            person. The design answers it by naming whose model each number comes from, by refusing time horizons, probabilities and advice in
            the AI layer, and by attaching a fixed disclaimer to every answer. These measures reduce the risk; they do not remove the need for
            clinical judgement.
          </p>
        </Section>

        {/* ------------------------------------------------------------------ 8 */}
        <Section id="s8" n="8" title="Future work">
          <ol className="rb-list">
            <li><strong>A consented, de-identified timeline per resident.</strong> Once resident consent, research-ethics review and a
              PHIPA-compliant agreement with the care home are in place, each new CT would be solved and compared with the resident&apos;s
              previous one under a de-identified resident ID, so a care team could see the femur&apos;s simulated stress and stress ratio change between scans,
              before a fall. Tiger Cloud already stores confirmed simulation-run records as a time series; the timeline would add the resident ID and the
              comparison. Privacy work comes first.</li>
            <li><strong>Calibrated material.</strong> CT-density-based stiffness from a calibrated density–modulus relation instead of one
              assumed modulus, together with a mesh-convergence study.</li>
            <li><strong>All 101 femurs.</strong> Solving every HFValid femur would allow Rainbone&apos;s own solve to be compared with each
              woman&apos;s recorded outcome.</li>
            <li><strong>Where care teams already work.</strong> After the approvals above, the check could run alongside a care home&apos;s
              records system, such as PointClickCare. No integration exists today, and Rainbone uses no PointClickCare data or API.</li>
            <li><strong>A model-path red team.</strong> The 9 questions that fell back to the refusal should be asked again when Gemini is not
              rate-limited, to test native triage under attack and the LangGraph deployment.</li>
          </ol>
        </Section>

        {/* ------------------------------------------------------------------ References */}
        <Section id="references" title="References">
          <p className="rb-note">Numbered by topic (femur data and fall loads [1–3], failure limits [4], pelvic imaging [5–7], inference
            energy [8, 9]), not by order of first citation; each entry is reproduced as it appears in the repository file named in brackets.</p>
          <ol className="rb-refs">
            <li><span>[1]</span><span>Aldieri, La Mattina, Szyszko, Baruffaldi, Viceconti (2025). <em>HFValid collection</em>. University of Bologna. DOI <a href="https://doi.org/10.6092/unibo/amsacta/8431">10.6092/unibo/amsacta/8431</a>. CC BY 4.0. [<Code>README.md</Code>, Data and credits]</span></li>
            <li><span>[2]</span><span>Bhattacharya, Altai, Qasim, Viceconti, &ldquo;A multiscale model to predict current absolute risk of femoral fracture in a postmenopausal population&rdquo;, Biomech Model Mechanobiol 2019. <a href="https://doi.org/10.1007/s10237-018-1081-0">https://doi.org/10.1007/s10237-018-1081-0</a>. [<Code>frontend/components/metrics-explainer.tsx</Code>]</span></li>
            <li><span>[3]</span><span>van den Kroonenberg A.J. et al. (1995), <a href="https://pubmed.ncbi.nlm.nih.gov/8618384/">PubMed 8618384</a>. [<Code>README.md</Code>, Data and credits]</span></li>
            <li><span>[4]</span><span>Strain-limit reference: <a href="https://www.jove.com/t/64947/imaging-of-the-microstructural-failure-mechanism-in-the-human-hip">https://www.jove.com/t/64947/imaging-of-the-microstructural-failure-mechanism-in-the-human-hip</a>. [<Code>frontend/public/models/femur-press/manifest.json</Code>, <Code>strain_limit_reference</Code>]</span></li>
            <li><span>[5]</span><span>Liu P. et al. Deep Learning to Segment Pelvic Bones: Large-scale CT Datasets and Baseline Models. IJCARS (2021). Zenodo record <a href="https://zenodo.org/records/4588403">4588403</a>, DOI <a href="https://doi.org/10.5281/zenodo.4588403">10.5281/zenodo.4588403</a>. CC BY 4.0. [<Code>README.md</Code>, Data and credits]</span></li>
            <li><span>[6]</span><span>Wasserthal J. et al. Radiology: Artificial Intelligence (2023), DOI <a href="https://doi.org/10.1148/ryai.230024">10.1148/ryai.230024</a>. Apache-2.0. [<Code>README.md</Code>, Data and credits; TotalSegmentator 2.18.0]</span></li>
            <li><span>[7]</span><span>Isensee, F., Jaeger, P. F., Kohl, S. A., Petersen, J., &amp; Maier-Hein, K. H. (2021). nnU-Net: a self-configuring method for deep learning-based biomedical image segmentation. Nature Methods, 18(2), 203-211. [<Code>scripts/vultr_pipeline/pipeline.py</Code>, TotalSegmentator <Code>also_cite</Code>]</span></li>
            <li><span>[8]</span><span>A. Vahdat, J. Dean, &ldquo;How much energy does Google&apos;s AI use? We did the math&rdquo;, Google Cloud blog, 21 Aug 2025. <a href="https://cloud.google.com/blog/products/infrastructure/measuring-the-environmental-impact-of-ai-inference">https://cloud.google.com/blog/products/infrastructure/measuring-the-environmental-impact-of-ai-inference</a>. [<Code>frontend/lib/ai-usage.ts</Code>]</span></li>
            <li><span>[9]</span><span>Elsworth et al., <a href="https://arxiv.org/abs/2508.15734">arXiv:2508.15734</a>. [<Code>frontend/lib/ai-usage.ts</Code>; <Code>README.md</Code>]</span></li>
          </ol>
        </Section>

        {/* ------------------------------------------------------------------ Annex A */}
        <Section id="annex-a" title="Annex A — Notation">
          <Table n={13} caption="Symbols used in this report.">
            <thead><tr><th>Symbol</th><th>Meaning</th><th>Value or unit</th></tr></thead>
            <tbody>
              <tr><td><M mathml={"<mrow><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Ω</mi></mpadded><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Ω</mi></mpadded><mi>h</mi></msub><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Ω</mi></mpadded><mi>e</mi></msub></mrow>"} /></td><td>Domain, its tetrahedral mesh, one element</td><td>mm</td></tr>
              <tr><td><M mathml={"<mrow><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Ω</mi></mpadded><mi>D</mi></msub><mo separator=\"true\">;</mo></mrow><mrow><mtext> </mtext><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Γ</mi></mpadded><mi>D</mi></msub><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Γ</mi></mpadded><mi>N</mi></msub><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Γ</mi></mpadded><mi>S</mi></msub></mrow>"} /></td><td>Clamped distal slab; its nodes, loaded exterior triangles, prescribed-stroke cap nodes (node sets include interior nodes)</td><td>—</td></tr>
              <tr><td><M mathml={"<mrow><mi>𝐮</mi><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><msub><mi>𝐮</mi><mi>h</mi></msub><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><mi>𝐔</mi></mrow>"} /></td><td>Displacement field, its P1 approximation, nodal vector</td><td>mm</td></tr>
              <tr><td><M mathml={"<mrow><mi>𝜺</mi><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><mi>𝜸</mi></mrow>"} /></td><td>Small-strain tensor; strain vector with engineering shear</td><td>—</td></tr>
              <tr><td><M mathml={"<mrow><mi>𝝈</mi><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><mover><mi>𝝈</mi><mo stretchy=\"false\" style=\"math-depth:0;\">^</mo></mover></mrow>"} /></td><td>Cauchy stress tensor; its six-component vector</td><td>MPa</td></tr>
              <tr><td><M mathml={"<mrow><mi>E</mi><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><mi>ν</mi><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><mi>λ</mi><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><mi>μ</mi></mrow>"} /></td><td>Young&apos;s modulus, Poisson ratio, Lamé constants</td><td>10,000 MPa, 0.3 (femur)</td></tr>
              <tr><td><M mathml={"<mrow><mi>𝐃</mi><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><mi>𝐊</mi><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><mi>𝐅</mi></mrow>"} /></td><td>Elasticity matrix, stiffness matrix, load vector</td><td>—</td></tr>
              <tr><td><M mathml={"<mrow><mover><mi>𝐭</mi><mo stretchy=\"false\" style=\"math-depth:0;\">‾</mo></mover><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><mi>F</mi><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><msub><mi>A</mi><mi>N</mi></msub></mrow>"} /></td><td>Traction, resultant load, loaded area</td><td>MPa, 800 N, mm²</td></tr>
              <tr><td><M mathml={"<mrow><mi>𝐫</mi><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><mi>𝐑</mi></mrow>"} /></td><td>Residual, support reaction</td><td>N</td></tr>
              <tr><td><M mathml={"<mrow><msub><mi>e</mi><mtext>free</mtext></msub><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><msub><mi>e</mi><mtext>bal</mtext></msub></mrow>"} /></td><td>Relative free residual and force-balance error</td><td>≤ 10⁻⁶</td></tr>
              <tr><td><M mathml={"<mrow><msub><mi>σ</mi><mrow><mi>v</mi><mi>M</mi></mrow></msub><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><msub><mover><mi>σ</mi><mo stretchy=\"false\" style=\"math-depth:0;\">‾</mo></mover><mrow><mi>v</mi><mi>M</mi></mrow></msub></mrow>"} /></td><td>Element and nodal-averaged von Mises stress</td><td>MPa</td></tr>
              <tr><td><M mathml={"<msub><mi>V</mi><mi>e</mi></msub>"} /></td><td>Element volume</td><td>mm³</td></tr>
              <tr><td><M mathml={"<mrow><msub><mi>R</mi><mtext>stand</mtext></msub><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><mi>I</mi></mrow>"} /></td><td>Stress-to-assumed-strength ratios (femur; uploads)</td><td>%; not a probability</td></tr>
              <tr><td><M mathml={"<mi>𝐜</mi>"} /></td><td>Femoral-head centre</td><td>(74.5402, −1.2438, −50.4298) mm</td></tr>
              <tr><td><M mathml={"<mrow><mpadded lspace=\"0\"><mi>HU</mi></mpadded><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><mi>ρ</mi><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><mover><mi>ρ</mi><mo stretchy=\"false\" style=\"math-depth:0;\">^</mo></mover></mrow>"} /></td><td>Hounsfield units, density estimate, normalised density</td><td>HU, g/cm³ (per docstring), —</td></tr>
              <tr><td><M mathml={"<mrow><msub><mi>f</mi><mi>i</mi></msub><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><msub><mpadded lspace=\"0\"><mi mathvariant=\"normal\">Δ</mi></mpadded><mi>i</mi></msub><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><msub><mi>ϕ</mi><mi>B</mi></msub><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><msub><mi>n</mi><mi>B</mi></msub></mrow>"} /></td><td>Block factor, voxel spacing, block bone fraction, bone voxels in block</td><td>—, mm, —, —</td></tr>
              <tr><td><M mathml={"<mrow><mi>s</mi><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><msub><mi>s</mi><mn>0</mn></msub><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><mi>P</mi></mrow>"} /></td><td>Press stroke, first-limit stroke, press load</td><td>mm, 1.9344 mm, N</td></tr>
              <tr><td><M mathml={"<mrow><msub><mi>d</mi><mi>e</mi></msub><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><msub><mi>κ</mi><mi>e</mi></msub><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><msub><mi>η</mi><mi>e</mi></msub></mrow>"} /></td><td>Damage, history variable, failure ratio</td><td>—</td></tr>
              <tr><td><M mathml={"<mrow><msub><mi>ε</mi><mi>t</mi></msub><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><msub><mi>ε</mi><mi>c</mi></msub><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><mi>β</mi><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><mi>r</mi><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><mi>ℓ</mi></mrow>"} /></td><td>Strain limits, softening coefficient, residual stiffness, averaging radius</td><td>0.0073, 0.0104, 3, 0.005, 3 mm</td></tr>
              <tr><td><M mathml={"<mi class=\"mathcal\">ℰ</mi>"} /></td><td>Elements eligible for damage</td><td>—</td></tr>
              <tr><td><M mathml={"<mrow><msub><mi>A</mi><mi>i</mi></msub><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><msub><mi>M</mi><mi>i</mi></msub></mrow>"} /></td><td>Published ARF0 and MSF of subject <M mathml={"<mi>i</mi>"} /></td><td>%, N</td></tr>
              <tr><td><M mathml={"<mrow><msup><mi>r</mi><mpadded lspace=\"0\" class=\"tml-sml-pad\"><mi>ARF0</mi></mpadded></msup><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><msup><mi>r</mi><mpadded lspace=\"0\" class=\"tml-sml-pad\"><mi>MSF</mi></mpadded></msup></mrow>"} /></td><td>Women with a lower ARF0; women with a stronger femur</td><td>56, 75 (Pat001)</td></tr>
              <tr><td><M mathml={"<mpadded lspace=\"0\"><mi mathvariant=\"normal\">Φ</mi></mpadded>"} /></td><td>Factor of risk, fall force over MSF</td><td>2.17–3.18 (Pat001)</td></tr>
              <tr><td><M mathml={"<mrow><mi>F</mi><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><mi>τ</mi><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><mi class=\"mathcal\">𝒜</mi></mrow>"} /></td><td>(In §5) fact set, model text, allowed numbers</td><td>—</td></tr>
              <tr><td><M mathml={"<mrow><mi>I</mi><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><mi>ρ</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>I</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><mi>R</mi></mrow>"} /></td><td>(In §5.4) selected statement IDs, rendered answer, required IDs</td><td>—</td></tr>
              <tr><td><M mathml={"<mrow><mi>u</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>m</mi><mo form=\"postfix\" stretchy=\"false\">)</mo><mo separator=\"true\">,</mo></mrow><mrow><mtext> </mtext><mi>u</mi><mo form=\"prefix\" stretchy=\"false\">(</mo><mi>k</mi><mo separator=\"true\">,</mo><mi>m</mi><mo form=\"postfix\" stretchy=\"false\">)</mo></mrow>"} /></td><td>Cooldown end of model <M mathml={"<mi>m</mi>"} />, of key <M mathml={"<mi>k</mi>"} /> for model <M mathml={"<mi>m</mi>"} /></td><td>s</td></tr>
            </tbody>
          </Table>
        </Section>

        {/* ------------------------------------------------------------------ Annex B */}
        <Section id="annex-b" title="Annex B — Reproducibility">
          <p>
            All paths are relative to the repository root. The commands are those given in the repository&apos;s READMEs; the femur build
            needs 3D Slicer 5.12.4 and TetGen 1.6.0 installed separately and Python with NumPy, SciPy, meshio and SfePy.
          </p>
          <Table n={14} caption="Artefacts behind the numbers in this report.">
            <thead><tr><th>Artefact</th><th>Path</th><th>Integrity</th></tr></thead>
            <tbody>
              <tr><td>Pat001 FE model and metrics</td><td><Code>frontend/public/models/hfvalid-femur/manifest.json</Code>, <Code>bone-fea.vtu</Code>, <Code>fea-surface.vtp</Code></td><td>manifest pinned: <Code>4a50adbccacca4d6d5f86d8cc71f15cec8959fb933b700d95a70c565bc95a10c</Code>; <Code>bone-fea.vtu</Code>: <Code>640996b0dc4c1d2d4daa211a6bfd9df1843a9b7129860cf7a5cf0de51fb70592</Code></td></tr>
              <tr><td>HFValid cohort table</td><td><Code>frontend/public/models/hfvalid-risk.json</Code></td><td>pinned: <Code>884f587550474de71c270b7d97f1768fd20cf6dda5d898214394a0811c2b6261</Code></td></tr>
              <tr><td>Press demonstration</td><td><Code>frontend/public/models/femur-press/manifest.json</Code> and 15 frames</td><td>records <Code>source_mesh_sha256</Code> <Code>e012cddb…d90f235</Code>, the sha256 of <Code>bone-fea.vtu</Code> with CRLF line endings</td></tr>
              <tr><td>Printable reconstruction</td><td><Code>frontend/public/models/femur-reconstruction/manifest.json</Code></td><td>records the press manifest&apos;s CRLF sha256 <Code>232f4c23…66f0f7</Code></td></tr>
              <tr><td>Red-team questions and scoring</td><td><Code>redteam/redteam_ask.py</Code>, <Code>redteam/REDTEAM.md</Code></td><td>standard library only</td></tr>
            </tbody>
          </Table>
          <p>
            <span className="rb-h4">Line endings.</span>{" "}
            <Code>.gitattributes</Code> marks <Code>*.vtu</Code> and <Code>*.vtp</Code> as <Code>-text</Code>, and the committed{" "}
            <Code>bone-fea.vtu</Code> has LF endings and matches the femur manifest. Its CRLF form hashes to the value recorded by the press
            manifest, and the CRLF form of the press manifest hashes to the value recorded by the reconstruction manifest. The mesh content is
            the same, but <Code>scripts/bone_fea/export_reconstruction.py</Code> compares raw hashes and raises &ldquo;The simulation uses a
            different source mesh.&rdquo; on an LF checkout until the recorded hashes are regenerated.
          </p>
          <p><span className="rb-h4">Run the application</span> (<Code>README.md</Code>, Run locally):</p>
          <pre className="rb-pre">{`cd frontend
npm ci
npm run dev

cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
uvicorn main:app --reload`}</pre>
          <p>
            Without keys both explanation cards answer from the deterministic template and the bundled facts. With <Code>DATABASE_URL</Code>{" "}
            set, <Code>python -m services.history migrate</Code> (from <Code>backend/</Code>) applies the schema.
          </p>
          <p><span className="rb-h4">Rebuild the femur model</span> (<Code>scripts/bone_fea/README.md</Code>, Reproduce; Windows paths as given there):</p>
          <pre className="rb-pre">{`python scripts/bone_fea/fetch_case.py --output C:/data/hfvalid
$env:RAINBOWBONE_INPUT = 'C:/data/hfvalid'
$env:RAINBOWBONE_OUTPUT = (Resolve-Path 'frontend/public/models/hfvalid-femur').Path
& 'C:/tools/Slicer/Slicer.exe' --no-splash --no-main-window --python-script scripts/bone_fea/import_femur_in_slicer.py
& 'C:/tools/Slicer/Slicer.exe' --no-splash --no-main-window --python-script scripts/bone_fea/prepare_femur_in_slicer.py
& 'C:/tools/tetgen.exe' '-pYq1.4a80z' frontend/public/models/hfvalid-femur/bone-surface.poly
python scripts/bone_fea/test_solve.py
python scripts/bone_fea/build_model.py --mesh frontend/public/models/hfvalid-femur/bone-surface.1.node`}</pre>
          <p><span className="rb-h4">Cohort table and press</span> (<Code>scripts/bone_fea/README.md</Code>):</p>
          <pre className="rb-pre">{`python scripts/bone_fea/build_risk_table.py --csv HFValid_Metadata.csv --output frontend/public/models/hfvalid-risk.json
python scripts/bone_fea/test_risk_table.py
python scripts/bone_fea/test_press.py
python scripts/bone_fea/build_press.py --checkpoint <local-checkpoint.npz>`}</pre>
          <p><span className="rb-h4">Tests</span> (<Code>backend/README.md</Code>):</p>
          <pre className="rb-pre">{`cd backend
python -m unittest -v
cd ..
python scripts/bone_fea/test_solve.py
python scripts/bone_fea/test_element_moduli.py`}</pre>
          <p><span className="rb-h4">Red team</span> (<Code>redteam/REDTEAM.md</Code>; production only when named explicitly):</p>
          <pre className="rb-pre">{`python3 redteam/redteam_ask.py run
python3 redteam/redteam_ask.py score
python3 redteam/redteam_ask.py run --base-url https://rainbone.health
python3 redteam/redteam_ask.py score --facts-ref origin/main`}</pre>
          <p className="rb-note">
            Rainbone project report · Hack the Valley 11 · 18 October 2026 · Research prototype · not a medical device · HFValid data CC BY 4.0, Aldieri et al.
            (2025) · CTPelvic1K data CC BY 4.0, Liu et al. (2021).
          </p>
        </Section>
      </article>
    </div>
    </Dashboard>
  );
}
