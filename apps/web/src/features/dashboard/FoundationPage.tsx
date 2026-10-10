import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Boxes,
  Check,
  CircleDot,
  Cpu,
  Database,
  Layers3,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Terminal,
} from 'lucide-react';
import modules from '../../../../../packages/contracts/routes.json';
import { useReadiness } from '../../hooks/useReadiness';
import {
  Button,
  Card,
  ErrorState,
  Loading,
  Tag,
} from '../../components/ui/primitives';

export function FoundationPage() {
  const readiness = useReadiness();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR WORKSPACE, REIMAGINED</p>
          <h1 tabIndex={-1}>A smarter start.</h1>
          <p>The foundation for connected, confident retail.</p>
        </div>
        <Tag tone="amber">
          <CircleDot size={14} aria-hidden="true" />
          Phase 0 · Foundation
        </Tag>
      </div>
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-kicker">
            <Sparkles size={16} aria-hidden="true" />
            BUILT TO GROW WITH YOU
          </span>
          <h2>
            Smart foundations.
            <br />
            Smarter retail.
          </h2>
          <p>
            From the first product to the next purchasing cycle.
            <br className="desktop-break" />
            One considered architecture, ready for what comes next.
          </p>
          <Link className="button" to="/help">
            Explore the foundation
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <span className="hero-disclaimer">
            Development workspace · no live retail data
          </span>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="art-core">
            <Boxes size={52} strokeWidth={1.4} />
            <span>SmartPOS</span>
          </div>
          <div className="art-label label-catalog">
            <Layers3 size={18} />
            Catalog
          </div>
          <div className="art-label label-inventory">
            <Database size={18} />
            Inventory
          </div>
          <div className="art-label label-intelligence">
            <Sparkles size={18} />
            Intelligence
          </div>
        </div>
      </section>
      <div
        className="foundation-stats"
        aria-label="Architecture scope, not business metrics"
      >
        <Card>
          <span className="stat-icon">
            <Boxes />
          </span>
          <div>
            <strong>
              {modules.length}
              <small>planned modules</small>
            </strong>
            <p>Connected by clear boundaries</p>
          </div>
        </Card>
        <Card>
          <span className="stat-icon">
            <Layers3 />
          </span>
          <div>
            <strong>
              {modules.reduce((total, item) => total + item.routes.length, 0)}
              <small>planned pages</small>
            </strong>
            <p>Documented, not yet implemented</p>
          </div>
        </Card>
        <Card>
          <span className="stat-icon">
            <ShieldCheck />
          </span>
          <div>
            <strong>
              Phase 0<small>foundation first</small>
            </strong>
            <p>No simulated business activity</p>
          </div>
        </Card>
      </div>
      <div className="dashboard-grid">
        <Card className="service-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">REAL-TIME READINESS</p>
              <h2>System connection</h2>
            </div>
            <Button
              className="button-icon button-secondary"
              aria-label="Refresh service status"
              onClick={() => void readiness.refetch()}
              disabled={readiness.isFetching}
            >
              <RefreshCw size={18} aria-hidden="true" />
            </Button>
          </div>
          <p className="muted">
            Live status from the Go API. Checked every 30 seconds.
          </p>
          {readiness.isPending ? (
            <Loading />
          ) : readiness.isError ? (
            <ErrorState
              message={readiness.error.message}
              retry={() => void readiness.refetch()}
            />
          ) : (
            <div className="service-ready" role="status">
              <span className="ready-icon">
                <Check />
              </span>
              <div>
                <strong>API & database ready</strong>
                <p>Connection and migration version verified.</p>
              </div>
              <Tag tone="success">Connected</Tag>
            </div>
          )}
          <div className="service-notes">
            <span>
              <Database size={17} aria-hidden="true" />
              PostgreSQL · transactional foundation
            </span>
            <span>
              <Cpu size={17} aria-hidden="true" />
              AI service · internal health only, no predictions
            </span>
          </div>
        </Card>
        <Card className="next-card">
          <Tag tone="amber">UP NEXT · PHASE 1</Tag>
          <h2>Make it your store.</h2>
          <p>
            Secure identity, organizations, branches and an accurate product
            catalog.
          </p>
          <ul>
            <li>
              <Check size={16} aria-hidden="true" />
              Server-managed sessions & permissions
            </li>
            <li>
              <Check size={16} aria-hidden="true" />
              Products, units & barcode handling
            </li>
          </ul>
          <Link to="/help" className="text-link">
            Read the development path
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </Card>
      </div>
      <section className="module-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ONE CONNECTED PLATFORM</p>
            <h2>Designed for the whole store</h2>
          </div>
          <span className="muted">Business modules are planned</span>
        </div>
        <div className="module-grid">
          {modules.map((item, index) => (
            <div className="module-item" key={item.module}>
              <span className="module-number">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <h3>{item.name}</h3>
                <span>{item.routes.length} planned pages</span>
              </div>
              <span className="module-phase">P{item.phase}</span>
            </div>
          ))}
        </div>
      </section>
      <div className="foundation-footnote">
        <Terminal size={18} aria-hidden="true" />
        <p>
          Explore the POS and authentication layout previews in the workspace
          navigation. They do not process sales or credentials.
        </p>
      </div>
    </>
  );
}
