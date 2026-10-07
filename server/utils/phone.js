'use strict';

const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const EXTENDED_ARABIC_INDIC_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

const toLatinDigits = (value) =>
  String(value)
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_INDIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(EXTENDED_ARABIC_INDIC_DIGITS.indexOf(digit)));

/**
 * Normalizes a phone number to a canonical form.
 * - Converts Arabic digits to Latin digits
 * - Strips spaces, dashes, parentheses and other separators
 * - Converts Egyptian international forms (+20 / 0020 / 20) to local form (01xxxxxxxxx)
 * Other international numbers are returned as digits only (without "+" or "00").
 * Returns an empty string for empty or non-string input.
 */
const normalizePhone = (value) => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' && typeof value !== 'number') return '';

  let digits = toLatinDigits(value).replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  // Egyptian mobile numbers: 20 + 1xxxxxxxxx (12 digits) -> 01xxxxxxxxx
  if (/^201\d{9}$/.test(digits)) {
    return `0${digits.slice(2)}`;
  }

  return digits;
};

/**
 * Returns true when the value is a plausible phone number (8-15 digits
 * after normalization). Egyptian numbers must match the local mobile format.
 */
const isValidPhone = (value) => {
  const phone = normalizePhone(value);
  if (!phone) return false;

  if (phone.startsWith('01') && phone.length === 11) {
    return /^01[0125]\d{8}$/.test(phone);
  }

  return /^\d{8,15}$/.test(phone);
};

/**
 * Returns every stored representation a phone number may have in the database,
 * so lookups match numbers saved as 01xxxxxxxxx, 201xxxxxxxxx or +201xxxxxxxxx.
 */
const phoneVariants = (value) => {
  const phone = normalizePhone(value);
  if (!phone) return [];

  const variants = new Set([phone]);

  if (/^01\d{9}$/.test(phone)) {
    const international = `20${phone.slice(1)}`;
    variants.add(international);
    variants.add(`+${international}`);
    variants.add(`00${international}`);
  } else {
    variants.add(`+${phone}`);
  }

  if (typeof value === 'string' && value.trim()) {
    variants.add(value.trim());
  }

  return Array.from(variants);
};

module.exports = {
  isValidPhone,
  normalizePhone,
  phoneVariants,
};
