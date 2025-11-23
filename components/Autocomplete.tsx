import { useState, useEffect, useRef } from 'react';

interface AutocompleteProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string, id?: string) => void;
  placeholder?: string;
  required?: boolean;
}

export default function Autocomplete({ id, label, value, onChange, placeholder, required }: AutocompleteProps) {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    onChange(val);

    if (val.length >= 2) {
      try {
        const res = await fetch(`/api/locations?query=${encodeURIComponent(val)}`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data);
          setShowSuggestions(true);
        }
      } catch (error) {
        console.error('Error fetching suggestions:', error);
      }
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelect = (suggestion: any) => {
    setInputValue(suggestion.name);
    onChange(suggestion.name, suggestion.id);
    setShowSuggestions(false);
  };

  return (
    <div className="form-group" ref={wrapperRef} style={{ position: 'relative' }}>
      <label htmlFor={id}>{label}</label>
      <input
        type="text"
        id={id}
        value={inputValue}
        onChange={handleInputChange}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
      />
      {showSuggestions && suggestions.length > 0 && (
        <ul className="suggestions-list">
          {suggestions.map((s) => (
            <li key={s.id} onClick={() => handleSelect(s)}>
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <style jsx>{`
        .suggestions-list {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background-color: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: 0.5rem;
          list-style: none;
          padding: 0;
          margin: 0.25rem 0 0;
          max-height: 200px;
          overflow-y: auto;
          z-index: 10;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        .suggestions-list li {
          padding: 0.75rem;
          cursor: pointer;
          color: var(--foreground);
          border-bottom: 1px solid var(--card-border);
        }
        .suggestions-list li:last-child {
          border-bottom: none;
        }
        .suggestions-list li:hover {
          background-color: rgba(59, 130, 246, 0.1);
        }
      `}</style>
    </div>
  );
}
