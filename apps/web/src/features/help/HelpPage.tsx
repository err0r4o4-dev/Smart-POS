import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Code2, ShieldCheck } from 'lucide-react';
import { Card, Tag } from '../../components/ui/primitives';

export function HelpPage() {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">DEVELOPER WORKSPACE</p>
          <h1 tabIndex={-1}>Build on solid ground.</h1>
          <p>A practical starting point for the five-developer team.</p>
        </div>
        <Tag tone="amber">Phase 0</Tag>
      </div>
      <div className="help-grid">
        <Card>
          <Code2 className="help-icon" />
          <h2>Start locally</h2>
          <p>From the repository root, with Node 24 and Docker Desktop:</p>
          <pre>
            <code>npm ci{'\n'}npm run stack:up</code>
          </pre>
          <p>
            Open localhost:8088 for the complete same-origin stack. Database
            volumes persist across restarts.
          </p>
        </Card>
        <Card>
          <ShieldCheck className="help-icon" />
          <h2>Know the boundary</h2>
          <p>
            Sign in to use the implemented catalog, inventory, POS, sales,
            purchasing, shelves, returns, pricing and customer modules. Access
            follows your organization, branch and role permissions.
          </p>
          <p>
            Forecasting, loyalty and the business analytics dashboard remain
            planned. The 106-route inventory is a roadmap, not 106 finished
            pages.
          </p>
        </Card>
        <Card>
          <BookOpen className="help-icon" />
          <h2>Follow the roadmap</h2>
          <p>
            Identity & catalog → inventory → POS & sales → purchasing & shelves
            → business operations → AI → production readiness.
          </p>
          <p>
            Detailed contracts, module ownership and acceptance gates are in the
            repository’s docs directory.
          </p>
        </Card>
      </div>
      <section className="preview-links">
        <h2>Explore the layout foundations</h2>
        <Link to="/preview/foundation" className="button button-secondary">
          Foundation preview
          <ArrowRight size={17} />
        </Link>
        <Link to="/preview/pos" className="button button-secondary">
          POS preview
          <ArrowRight size={17} />
        </Link>
        <Link to="/preview/auth" className="button button-secondary">
          Authentication preview
          <ArrowRight size={17} />
        </Link>
      </section>
    </>
  );
}
