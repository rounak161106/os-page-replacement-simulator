/**
 * FrameLab - Input Validation Module
 * Pure functions for validating reference sequences and frame parameters.
 */

/**
 * Validates and parses a page reference string.
 * Supports comma-separated, space-separated, or comma-and-space separated integers.
 * Rejects consecutive commas, negative values, decimals, empty input, and non-numeric tokens.
 *
 * @param {string} input - Raw user input string
 * @param {object} [options] - Optional constraints
 * @param {number} [options.minPages=1] - Minimum number of page references
 * @param {number} [options.maxPages=100] - Maximum number of page references
 * @param {number} [options.minPageValue=0] - Minimum integer value of a page
 * @param {number} [options.maxPageValue=999] - Maximum integer value of a page
 * @returns {{ isValid: boolean, pages?: number[], error?: string }}
 */
export function validateReferenceString(input, options = {}) {
  const {
    minPages = 1,
    maxPages = 100,
    minPageValue = 0,
    maxPageValue = 999
  } = options;

  if (typeof input !== 'string') {
    return {
      isValid: false,
      error: 'Reference string must be text.'
    };
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return {
      isValid: false,
      error: 'Reference string cannot be empty. Please enter page numbers separated by commas or spaces.'
    };
  }

  // Check for misplaced/consecutive commas:
  // Leading comma, trailing comma, or two commas with optional whitespace between
  if (/^,|,$/.test(trimmed)) {
    return {
      isValid: false,
      error: 'Reference string has a leading or trailing comma without a page number.'
    };
  }

  if (/,(\s*,)+/.test(trimmed)) {
    return {
      isValid: false,
      error: 'Reference string contains consecutive commas with no page number between them.'
    };
  }

  // Tokenize by splitting on commas and/or spaces
  // First normalize commas to spaces while detecting non-standard characters
  const rawTokens = trimmed
    .split(/[\s,]+/)
    .filter(token => token.length > 0);

  if (rawTokens.length < minPages) {
    return {
      isValid: false,
      error: `Please enter at least ${minPages} page reference.`
    };
  }

  if (rawTokens.length > maxPages) {
    return {
      isValid: false,
      error: `Reference string exceeds maximum limit of ${maxPages} pages (received ${rawTokens.length}).`
    };
  }

  const pages = [];

  for (let i = 0; i < rawTokens.length; i++) {
    const token = rawTokens[i];

    // Check for negative numbers or explicit signs
    if (token.startsWith('-')) {
      return {
        isValid: false,
        error: `Invalid page "${token}". Negative page numbers are not allowed.`
      };
    }

    // Check for decimals
    if (token.includes('.')) {
      return {
        isValid: false,
        error: `Invalid page "${token}". Page numbers must be whole integers, not decimals.`
      };
    }

    // Check for non-digit characters
    if (!/^\d+$/.test(token)) {
      return {
        isValid: false,
        error: `Invalid token "${token}". Page references must only contain numbers 0–${maxPageValue}.`
      };
    }

    const num = Number(token);
    if (!Number.isSafeInteger(num) || num < minPageValue || num > maxPageValue) {
      return {
        isValid: false,
        error: `Page "${token}" is outside allowed range (${minPageValue}–${maxPageValue}).`
      };
    }

    pages.push(num);
  }

  return {
    isValid: true,
    pages
  };
}

/**
 * Validates the number of memory frames.
 *
 * @param {number|string} input - Frame count input
 * @param {number} [minFrames=1] - Minimum allowable frames
 * @param {number} [maxFrames=10] - Maximum allowable frames
 * @returns {{ isValid: boolean, frameCount?: number, error?: string }}
 */
export function validateFrameCount(input, minFrames = 1, maxFrames = 10) {
  if (input === null || input === undefined || (typeof input === 'string' && input.trim() === '')) {
    return {
      isValid: false,
      error: 'Number of frames is required.'
    };
  }

  const num = typeof input === 'number' ? input : Number(input);

  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    return {
      isValid: false,
      error: 'Frame count must be a whole integer.'
    };
  }

  if (num < minFrames || num > maxFrames) {
    return {
      isValid: false,
      error: `Frame count must be between ${minFrames} and ${maxFrames}.`
    };
  }

  return {
    isValid: true,
    frameCount: num
  };
}
