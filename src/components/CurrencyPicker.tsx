import { useEffect, useMemo, useState } from 'react';

import { CurrencyMeta, getCurrencyMeta, getCurrencyPickerGroups } from '../constants/currencies';
import { CurrencyCode } from '../types';

interface CurrencyPickerProps {
  value: CurrencyCode;
  onChange: (currency: CurrencyCode) => void;
  includeKrw?: boolean;
  modalTitle?: string;
  grouped?: boolean;
  triggerVariant?: 'default' | 'guide';
  triggerLabel?: string;
  triggerHint?: string;
}

function getCurrencyLabel(item: CurrencyMeta): string {
  const compactCountry = item.country.replace(/\s+/g, '');
  const compactName = item.name.replace(/\s+/g, '');

  if (compactName.startsWith(compactCountry)) {
    const unit = compactName.slice(compactCountry.length);
    if (unit) {
      return `${item.country} ${unit}`;
    }
  }

  return item.name;
}

export function CurrencyPicker({
  value,
  onChange,
  includeKrw = true,
  modalTitle = '통화 선택',
  grouped = true,
  triggerVariant = 'default',
  triggerLabel,
  triggerHint,
}: CurrencyPickerProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);

  const selected = getCurrencyMeta(value);
  const groups = useMemo(() => getCurrencyPickerGroups({ includeKrw }), [includeKrw]);
  const options = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeydown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => {
      window.removeEventListener('keydown', handleKeydown);
    };
  }, [isOpen]);

  function handleSelect(currency: CurrencyCode): void {
    onChange(currency);
    setIsOpen(false);
  }

  function renderOption(item: CurrencyMeta): JSX.Element {
    return (
      <li key={item.code}>
        <button
          type="button"
          className={`currency-option-btn ${value === item.code ? 'currency-option-btn-active' : ''} ${!grouped ? 'currency-option-btn-foreign' : ''}`}
          onClick={() => handleSelect(item.code)}
        >
          <span className="currency-option-left">
            <span className="currency-option-flag" aria-hidden="true">
              {item.flag}
            </span>
            <span className="currency-option-name">
              <strong>{getCurrencyLabel(item)}</strong>
              <span>{item.country}</span>
            </span>
          </span>
          <span className="currency-option-right">
            <b>{item.code}</b>
            <small>{item.symbol}</small>
          </span>
        </button>
      </li>
    );
  }

  return (
    <div className="currency-picker">
      <button
        type="button"
        className={`currency-picker-trigger ${triggerVariant === 'guide' ? 'currency-picker-trigger-guide' : ''}`}
        onClick={() => setIsOpen(true)}
      >
        {triggerVariant === 'guide' ? (
          <>
            <span className="currency-picker-guide-icon" aria-hidden="true">
              +
            </span>
            <span className="currency-picker-trigger-text">
              <strong>{triggerLabel ?? '다른 외화 고르기'}</strong>
              <span>{triggerHint ?? `현재 선택: ${getCurrencyLabel(selected)}`}</span>
            </span>
            <span className="currency-picker-trigger-code">
              <b>{selected.code}</b>
              <small>{selected.symbol}</small>
            </span>
          </>
        ) : (
          <>
            <span className="currency-picker-flag" aria-hidden="true">
              {selected.flag}
            </span>
            <span className="currency-picker-trigger-text">
              <strong>{getCurrencyLabel(selected)}</strong>
              <span>{selected.code}</span>
            </span>
            <span className="currency-picker-trigger-code">
              <b>{selected.code}</b>
              <small>{selected.symbol}</small>
            </span>
          </>
        )}
      </button>

      {isOpen ? (
        <div className="sheet-overlay currency-picker-overlay" role="presentation" onClick={() => setIsOpen(false)}>
          <section
            className={`bottom-sheet currency-picker-sheet ${!grouped ? 'currency-picker-sheet-foreign' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label={modalTitle}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bottom-sheet-head">
              <strong>{modalTitle}</strong>
              <button type="button" className="text-btn" onClick={() => setIsOpen(false)}>
                닫기
              </button>
            </div>

            <div className={`bottom-sheet-body currency-picker-body ${!grouped ? 'currency-picker-body-foreign' : ''}`}>
              {grouped ? (
                groups.map((group) => (
                  <section key={group.region} className="currency-group">
                    <h5>{group.region}</h5>
                    <ul className="currency-option-list">{group.items.map((item) => renderOption(item))}</ul>
                  </section>
                ))
              ) : (
                <ul className="currency-option-list currency-option-list-flat">{options.map((item) => renderOption(item))}</ul>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
