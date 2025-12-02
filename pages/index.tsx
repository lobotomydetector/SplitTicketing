import Head from 'next/head';
import { useState } from 'react';
import Autocomplete from '../components/Autocomplete';

export default function Home() {
  const [from, setFrom] = useState('');
  const [fromId, setFromId] = useState('');
  const [to, setTo] = useState('');
  const [toId, setToId] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState('');

  const [loadingMore, setLoadingMore] = useState(false);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResults(null);

    try {
      let url = `/api/search?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${encodeURIComponent(date)}`;
      if (fromId) url += `&fromId=${encodeURIComponent(fromId)}`;
      if (toId) url += `&toId=${encodeURIComponent(toId)}`;

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Search failed');
      }

      setResults(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!results || !results.results || results.results.length === 0) return;

    setLoadingMore(true);
    try {
      const lastJourney = results.results[results.results.length - 1];
      const lastDeparture = lastJourney.journey.legs[0].departure;
      // Add 1 minute to avoid fetching the same train again? 
      // Or just use the exact time, as the API usually returns connections >= time.
      // To be safe, let's add 1 minute.
      const nextDate = new Date(new Date(lastDeparture).getTime() + 60000).toISOString();

      let url = `/api/search?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${encodeURIComponent(nextDate)}`;
      if (fromId) url += `&fromId=${encodeURIComponent(fromId)}`;
      if (toId) url += `&toId=${encodeURIComponent(toId)}`;

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to load more');
      }

      setResults((prev: any) => ({
        ...prev,
        results: [...prev.results, ...data.results]
      }));

    } catch (err: any) {
      console.error('Load more error:', err);
      // Optionally show error
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="container">
      <Head>
        <title>Split Ticketing Search</title>
        <meta name="description" content="Find cheaper train tickets by splitting your journey" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="main">
        <h1 className="title">
          Split Ticketing Search
        </h1>

        <form onSubmit={search} className="search-form">
          <Autocomplete
            id="from"
            label="From"
            value={from}
            onChange={(val, id) => { setFrom(val); setFromId(id || ''); }}
            placeholder="e.g. Berlin Hbf"
            required
          />

          <Autocomplete
            id="to"
            label="To"
            value={to}
            onChange={(val, id) => { setTo(val); setToId(id || ''); }}
            placeholder="e.g. München Hbf"
            required
          />

          <div className="form-group">
            <label htmlFor="date">Date</label>
            <input
              type="datetime-local"
              id="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <button type="submit" disabled={loading} className="search-button">
            {loading ? 'Searching...' : 'Find Tickets'}
          </button>
        </form>

        {error && <div className="error">{error}</div>}

        {results && results.results && (
          <div className="results">
            <h2>Results for {results.from.name} to {results.to.name}</h2>
            
            {results.results.map((result: any, idx: number) => (
                <div key={idx} className="journey-container">
                    <div className="card direct-card">
                        <div className="journey-header">
                            <h3>
                                {new Date(result.journey.legs[0].departure).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} 
                                {' - '}
                                {new Date(result.journey.legs[result.journey.legs.length-1].arrival).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </h3>
                            <div className="price">
                                {result.directPrice ? `${result.directPrice} EUR` : 'Price not available'}
                            </div>
                        </div>
                        <div className="details">
                            Duration: {calculateDuration(result.journey.legs[0].departure, result.journey.legs[result.journey.legs.length-1].arrival)}
                            <br/>
                            Transfers: {result.journey.legs.length - 1}
                        </div>
                    </div>

                    {result.splitOptions && result.splitOptions.length > 0 ? (
                    <div className="split-list">
                        <h4>Split Options</h4>
                        {result.splitOptions.map((option: any, index: number) => (
                        <div key={index} className={`card split-card ${option.savings > 0 ? 'savings' : ''}`}>
                            <div className="split-header">
                            <h5>Split at {option.splitStation.name}</h5>
                            <div className="total-price">
                                {option.totalPrice.toFixed(2)} EUR
                            </div>
                            </div>
                            
                            <div className="savings-badge">
                            {option.savings > 0 ? `Save ${option.savings.toFixed(2)} EUR` : `More expensive by ${Math.abs(option.savings).toFixed(2)} EUR`}
                            </div>

                            <div className="segments">
                            <div className="segment">
                                <span>Ticket 1: {results.from.name} → {option.splitStation.name}</span>
                                <span className="segment-price">{option.price1} EUR</span>
                            </div>
                            <div className="segment">
                                <span>Ticket 2: {option.splitStation.name} → {results.to.name}</span>
                                <span className="segment-price">{option.price2} EUR</span>
                            </div>
                            </div>
                        </div>
                        ))}
                    </div>
                    ) : (
                    <p className="no-splits">No split options found for this connection.</p>
                    )}
                </div>
            ))}

            <button onClick={loadMore} disabled={loadingMore} className="search-button" style={{marginTop: '1rem'}}>
                {loadingMore ? 'Loading more...' : 'Load More Results'}
            </button>
          </div>
        )}
      </main>
      <style jsx>{`
        .journey-container {
            margin-bottom: 3rem;
            border-bottom: 1px solid var(--card-border);
            padding-bottom: 2rem;
        }
        .journey-container:last-child {
            border-bottom: none;
        }
        .journey-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .no-splits {
            color: #94a3b8;
            font-style: italic;
            margin-top: 1rem;
        }
      `}</style>
    </div>
  );
}

function calculateDuration(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diff = endDate.getTime() - startDate.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}
