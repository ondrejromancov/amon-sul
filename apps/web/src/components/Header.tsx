import './header.css';
import { LogoIcon, SearchIcon } from './icons';

interface Props {
  query: string;
  onQuery: (q: string) => void;
  errorCount: number;
  onErrors: () => void;
  mock: boolean;
}

export function Header({ query, onQuery, errorCount, onErrors, mock }: Props) {
  return (
    <header>
      <div className="logo">
        <LogoIcon />
        Amon Sûl <span>· GCP watchtower</span>
      </div>
      <div className="search">
        <SearchIcon />
        <input
          type="text"
          placeholder="filter services, projects…"
          aria-label="Filter services"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </div>
      <div className="hspacer" />
      {mock && <span className="mockbadge">mock data</span>}
      <button className="errbtn" onClick={onErrors}>
        errors <span className="count">{errorCount}</span>
      </button>
    </header>
  );
}
