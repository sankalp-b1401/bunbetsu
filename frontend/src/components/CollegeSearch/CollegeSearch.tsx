import { useState, type FC, type FormEvent } from 'react';
import type { CampusData } from '../../types/map';
import './CollegeSearch.css';

interface CollegeSearchProps {
  onSearch: (college: string) => void;
  isLoading: boolean;
  error: string | null;
  currentCampus: CampusData | null;
  onClearError: () => void;
}

const PRESET_SUGGESTIONS = [
  'MNNIT Allahabad',
  'IIT Kanpur',
  'IIT Delhi',
  'IIT Bombay',
];

export const CollegeSearch: FC<CollegeSearchProps> = ({
  onSearch,
  isLoading,
  error,
  currentCampus,
  onClearError,
}) => {
  const [query, setQuery] = useState('MNNIT Allahabad');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  const handleSuggestionClick = (name: string) => {
    setQuery(name);
    onSearch(name);
  };

  return (
    <div className="bunbetsu-overlay">
      <div className="bunbetsu-search-card">
        <header className="bunbetsu-brand">
          <div className="bunbetsu-brand-logo">分別</div>
          <div className="bunbetsu-brand-text">
            <h1 className="bunbetsu-title">Bunbetsu Map</h1>
            <span className="bunbetsu-subtitle">Event Waste Management</span>
          </div>
        </header>

        <form className="bunbetsu-search-form" onSubmit={handleSubmit}>
          <div className="bunbetsu-input-group">
            <input
              type="text"
              className="bunbetsu-input"
              placeholder="Enter college name (e.g. IIT Delhi)..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (error) onClearError();
              }}
              disabled={isLoading}
              autoFocus
            />
            <button
              type="submit"
              className="bunbetsu-search-button"
              disabled={isLoading || !query.trim()}
            >
              {isLoading ? (
                <span className="bunbetsu-spinner" aria-hidden="true" />
              ) : (
                'Find Campus'
              )}
            </button>
          </div>
        </form>

        {/* Suggestion tags for quick testing */}
        <div className="bunbetsu-suggestions">
          <span className="bunbetsu-suggestions-label">Try:</span>
          {PRESET_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="bunbetsu-chip"
              onClick={() => handleSuggestionClick(suggestion)}
              disabled={isLoading}
            >
              {suggestion}
            </button>
          ))}
        </div>

        {/* Error message */}
        {error && (
          <div className="bunbetsu-alert bunbetsu-alert-error" role="alert">
            <div className="bunbetsu-alert-content">
              <strong>Unable to load campus:</strong>
              <p>{error}</p>
            </div>
            <button
              type="button"
              className="bunbetsu-alert-close"
              onClick={onClearError}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        {/* Campus info badge when loaded */}
        {currentCampus && !isLoading && (
          <div className="bunbetsu-campus-meta">
            <div className="bunbetsu-meta-header">
              <span className="bunbetsu-status-dot" />
              <strong className="bunbetsu-campus-name">{currentCampus.name}</strong>
            </div>
            <p className="bunbetsu-campus-desc">{currentCampus.display_name}</p>
            <div className="bunbetsu-meta-tags">
              <span className="bunbetsu-tag">
                Type: {currentCampus.geometry.type}
              </span>
              <span className="bunbetsu-tag">
                OSM {currentCampus.osm_type}: {currentCampus.osm_id}
              </span>
              <span className="bunbetsu-tag">
                {currentCampus.latitude.toFixed(4)}, {currentCampus.longitude.toFixed(4)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

