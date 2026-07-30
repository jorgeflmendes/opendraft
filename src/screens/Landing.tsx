import { AppHeader, ThemeToggle } from "@/components/chrome";
import { Button, I } from "@/components/primitives";
import { preloadProjectsScreen } from "@/lib/screen-preload";
import { useScreen } from "@/store/screen";

const WORKFLOW = [
  [
    "01",
    "Structured source",
    "Write with LaTeX syntax, references, bibliography tools and project-wide search.",
  ],
  [
    "02",
    "Real compilation",
    "Run XeLaTeX, pdfLaTeX or LuaLaTeX with the supporting TeX toolchain.",
  ],
  [
    "03",
    "Precise review",
    "Read and select the PDF, control pages and zoom, and move between source and output.",
  ],
] as const;

export function LandingScreen() {
  const go = useScreen((state) => state.go);

  return (
    <main className="od-site-shell">
      <div className="od-document-frame">
        <AppHeader
          actions={
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => go("projects")}
                onFocus={preloadProjectsScreen}
                onPointerEnter={preloadProjectsScreen}
              >
                Projects
              </Button>
              <ThemeToggle />
            </>
          }
        />

        <section className="od-hero" aria-labelledby="landing-title">
          <div className="od-hero-copy">
            <p className="od-eyebrow">Local-first LaTeX editor</p>
            <h1 id="landing-title" className="od-h1">
              Your research, from first line to <span>final PDF.</span>
            </h1>
            <p className="od-lead">
              Write, compile and review papers in one precise workspace. OpenDraft runs the TeX
              toolchain in your browser, so your source does not need to leave your device.
            </p>
            <div className="od-hero-actions">
              <Button
                variant="primary"
                size="lg"
                trailingIcon={<I.arrowR size={13} />}
                onClick={() => go("projects")}
                onFocus={preloadProjectsScreen}
                onPointerEnter={preloadProjectsScreen}
              >
                Open project workspace
              </Button>
            </div>
            <ul className="od-hero-facts" aria-label="Workspace properties">
              <li>
                <I.lock size={13} />
                No account required
              </li>
              <li>Local compilation</li>
              <li>Source-to-PDF sync</li>
            </ul>
          </div>

          <figure className="od-product-proof" aria-labelledby="product-proof-title">
            <figcaption id="product-proof-title">
              <span>Source and output</span>
              <span>One workspace</span>
            </figcaption>
            <div className="od-product-proof-grid">
              <div className="od-proof-source">
                <span className="od-proof-label">main.tex</span>
                <pre>
                  <code>
                    <span className="od-code-command">{"\\begin"}</span>
                    {"{theorem}[Stokes]\n"}
                    {"  Let $M$ be an oriented\n"}
                    {"  manifold with boundary.\n\n"}
                    <span className="od-code-command">{"  \\["}</span>
                    {"\n"}
                    {"    \\int_{\\partial M}\\omega\n"}
                    {"      = \\int_M d\\omega\n"}
                    <span className="od-code-command">{"  \\]"}</span>
                    {"\n"}
                    <span className="od-code-command">{"\\end"}</span>
                    {"{theorem}"}
                  </code>
                </pre>
              </div>
              <div className="od-proof-output">
                <span className="od-proof-label">Compiled PDF</span>
                <article className="od-proof-paper">
                  <p className="od-proof-running-head">Differential Geometry</p>
                  <p>
                    <strong>Theorem 1 (Stokes).</strong>{" "}
                    <em>Let M be an oriented manifold with boundary.</em>
                  </p>
                  <p className="od-proof-equation">
                    ∫<sub>∂M</sub> ω = ∫<sub>M</sub> dω
                  </p>
                  <p className="od-proof-page">1</p>
                </article>
              </div>
            </div>
          </figure>
        </section>

        <section className="od-capabilities" aria-labelledby="capabilities-title">
          <header>
            <p className="od-eyebrow">The writing loop</p>
            <h2 id="capabilities-title">From structured source to a finished paper.</h2>
            <p>
              The tools needed to draft, compile and inspect a technical document stay together.
            </p>
          </header>
          <ol>
            {WORKFLOW.map(([index, title, detail]) => (
              <li key={index}>
                <span className="od-capability-index">{index}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="od-trust-section" aria-labelledby="trust-title">
          <div className="od-trust-intro">
            <p className="od-eyebrow">Private by architecture</p>
            <h2 id="trust-title">Your document remains your document.</h2>
            <p>
              OpenDraft is designed around local files, local persistence and browser-based
              compilation—not an account or a remote document server.
            </p>
          </div>
          <dl className="od-trust-grid">
            <div>
              <dt>No account gate</dt>
              <dd>Open the workspace and start writing without creating an account.</dd>
            </div>
            <div>
              <dt>Local project storage</dt>
              <dd>Projects remain available in this browser between writing sessions.</dd>
            </div>
            <div>
              <dt>Browser TeX runtime</dt>
              <dd>XeLaTeX, pdfLaTeX and LuaLaTeX compile locally with WebAssembly.</dd>
            </div>
          </dl>
        </section>

        <footer className="od-landing-footer">
          <span>OpenDraft 0.1.0</span>
          <ul aria-label="Product principles">
            <li>Private by design</li>
            <li>Built for technical writing</li>
            <li>No account required</li>
          </ul>
          <span>Source, compile, review</span>
        </footer>
      </div>
    </main>
  );
}
