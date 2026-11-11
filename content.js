console.log("Marstoy extension loaded");

const setNameCache = new Map();

// Utility functions
function reverseString(str) {
    return str.split('').reverse().join('');
}

function decodeHtmlEntities(text) {
    const parser = new DOMParser();
    const dom = parser.parseFromString(
        '<!doctype html><body>' + text, 'text/html');
    return dom.body.textContent;

}

// Set data sources. Names come from the bundled LOCAL_SETS (sets.js, built from
// Rebrickable's catalog dump), so lookups work even when BrickLink is down.
const ENRICHED_CLASS = 'marstoy-set-enriched';
const REMOTE_LOOKUP_TIMEOUT_MS = 5000;

function setInfoUrl(setNumber) {
    return `https://rebrickable.com/sets/${setNumber}-1/`;
}

// Tried in order; if all fail the original Marstoy image is restored.
function setImageUrls(setNumber) {
    return [
        `https://cdn.rebrickable.com/media/sets/${setNumber}-1.jpg`,
        `https://img.bricklink.com/ItemImage/SN/0/${setNumber}-1.png`
    ];
}

function createSetLink(setNumber, setName) {
    const link = document.createElement('a');
    link.href = setInfoUrl(setNumber);
    link.dataset.marstoySet = setNumber;
    link.textContent = `(${setName})`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.marginLeft = '5px';
    link.style.color = '#0066cc';
    link.style.textDecoration = 'none';
    link.style.padding = '4px 8px';
    link.style.minHeight = '44px';
    link.style.display = 'inline-block';
    link.style.verticalAlign = 'middle';
    link.addEventListener('mouseover', () => link.style.textDecoration = 'underline');
    link.addEventListener('mouseout', () => link.style.textDecoration = 'none');
    return link;
}

function normalizeUrlForComparison(url) {
    try {
        const parsed = new URL(url, window.location.href);
        return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
    } catch (error) {
        return url || '';
    }
}

function isProductLink(url) {
    try {
        const parsed = new URL(url, window.location.href);
        return parsed.pathname.includes('/products/');
    } catch (error) {
        return false;
    }
}

function looksLikeProductImage(img) {
    if (!(img instanceof HTMLImageElement)) return false;

    const src = (img.currentSrc || img.src || '').toLowerCase();
    const alt = (img.alt || '').toLowerCase();
    const combined = `${src} ${alt}`;

    if (!src) return false;
    if (combined.includes('.svg')) return false;
    if (combined.includes('.gif')) return false;
    if (/(logo|icon|loading|loader|chat|package-opening|cube-shape|grid-square)/.test(combined)) return false;
    if (img.closest('header, nav, footer, [role="dialog"]')) return false;

    const width = img.clientWidth || img.width || Number.parseInt(img.getAttribute('width') || '0', 10);
    const height = img.clientHeight || img.height || Number.parseInt(img.getAttribute('height') || '0', 10);

    if ((width && width < 80) || (height && height < 80)) return false;

    return true;
}

function getProductLinks(container) {
    return Array.from(container.querySelectorAll('a[href]')).filter(link => isProductLink(link.href));
}

function scoreProductContainer(container, titleElement, productCode) {
    const text = container.textContent || '';
    const productLinks = getProductLinks(container);
    const productImages = Array.from(container.querySelectorAll('img')).filter(looksLikeProductImage);
    const uniqueProductLinks = new Set(productLinks.map(link => normalizeUrlForComparison(link.href)));
    const codeRegex = new RegExp(`\\b${productCode}\\b`, 'i');
    let score = 0;

    if (!container.contains(titleElement)) return Number.NEGATIVE_INFINITY;
    if (!productImages.length && !/\b(add to cart|buy now|shipping estimated|product details)\b/i.test(text)) {
        return Number.NEGATIVE_INFINITY;
    }

    score += 5;
    if (productImages.length) score += 15;
    if (productImages.some(img => img.compareDocumentPosition(titleElement) & Node.DOCUMENT_POSITION_FOLLOWING)) {
        score += 10;
    }
    if (/\b(add to cart|buy now)\b/i.test(text)) score += 30;
    if (/\b(shipping estimated|product details)\b/i.test(text)) score += 15;
    if (productLinks.length) score += 10;
    if (uniqueProductLinks.size === 1) score += 20;
    else if (uniqueProductLinks.size <= 3) score += 10;
    if (uniqueProductLinks.size > 12) score -= 40;
    if (productImages.length > 8) score -= 20;
    if (codeRegex.test(text)) score += 10;
    if (container === document.body) score -= 100;

    return score;
}

function findProductContainer(textNode, productCode) {
    const titleElement = textNode.parentElement;
    let current = titleElement;
    let bestContainer = titleElement;
    let bestScore = Number.NEGATIVE_INFINITY;

    while (current && current !== document.body) {
        const score = scoreProductContainer(current, titleElement, productCode);
        if (score > bestScore) {
            bestScore = score;
            bestContainer = current;
        }
        current = current.parentElement;
    }

    return bestContainer;
}

function dedupeElements(elements) {
    return Array.from(new Set(elements));
}

function findProductImages(container, titleElement, productCode) {
    const titleAnchor = titleElement.closest('a[href]');
    const codeRegex = new RegExp(`\\b${productCode}\\b`, 'i');
    const allImages = Array.from(container.querySelectorAll('img')).filter(looksLikeProductImage);

    if (!allImages.length) return [];

    let productUrl = null;
    if (titleAnchor && isProductLink(titleAnchor.href)) {
        productUrl = normalizeUrlForComparison(titleAnchor.href);
    } else {
        const matchingAnchor = getProductLinks(container).find(link => codeRegex.test(link.textContent || ''));
        if (matchingAnchor) {
            productUrl = normalizeUrlForComparison(matchingAnchor.href);
        }
    }

    let candidates = [];

    if (productUrl) {
        candidates = allImages.filter(img => {
            const parentLink = img.closest('a[href]');
            return parentLink && normalizeUrlForComparison(parentLink.href) === productUrl;
        });
    }

    if (!candidates.length) {
        candidates = allImages.filter(img => img.compareDocumentPosition(titleElement) & Node.DOCUMENT_POSITION_FOLLOWING);
    }

    if (!candidates.length) {
        candidates = allImages;
    }

    return dedupeElements(candidates).slice(0, 6);
}

function findLinkInsertionTarget(textNode, productCode) {
    const titleElement = textNode.parentElement;
    const codeRegex = new RegExp(`\\b${productCode}\\b`, 'i');
    const titleAnchor = titleElement?.closest('a[href]');

    if (titleAnchor && isProductLink(titleAnchor.href) && codeRegex.test(titleAnchor.textContent || '')) {
        return {
            mode: 'after',
            element: titleAnchor
        };
    }

    const inlineHost = titleElement?.closest('h1, h2, h3, h4, h5, h6, p, span, div, li');
    if (inlineHost && inlineHost.textContent && inlineHost.textContent.trim().length < 160) {
        return {
            mode: 'append',
            element: inlineHost
        };
    }

    return null;
}

// Check if any ancestor has already been enriched
function hasEnrichedAncestor(node) {
    return Boolean(node.parentElement?.closest(`.${ENRICHED_CLASS}`));
}

// Set name lookup: bundled data first, BrickLink only for sets newer than the bundle.
async function fetchSetName(setNumber) {
    const localName = typeof LOCAL_SETS !== 'undefined' ? LOCAL_SETS[setNumber] : undefined;
    if (localName) return localName;

    if (!setNameCache.has(setNumber)) {
        const promise = (async () => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), REMOTE_LOOKUP_TIMEOUT_MS);
            try {
                const response = await fetch(`https://www.bricklink.com/v2/catalog/catalogitem.page?S=${setNumber}`, {
                    redirect: 'follow',
                    signal: controller.signal
                });
                // When BrickLink is down it redirects to a maintenance page whose
                // headings would otherwise be mistaken for a set name.
                if (!response.ok || !response.url.includes('catalogitem.page')) return null;
                const html = await response.text();

                const titlePatterns = [
                    /catalogitem\.page\?S=\d+-1"[^>]*>([^<]+)<\/a>/,
                    /<title>([^<]+) \| BrickLink/,
                    /<h1[^>]*>([^<]+)<\/h1>/
                ];

                for (const pattern of titlePatterns) {
                    const match = html.match(pattern);
                    if (match && match[1]) {
                        return decodeHtmlEntities(match[1].trim());
                    }
                }

                return null;
            } catch (error) {
                console.warn(`BrickLink lookup failed for set ${setNumber}:`, error);
                return null;
            } finally {
                clearTimeout(timer);
            }
        })();

        setNameCache.set(setNumber, promise);
    }

    return setNameCache.get(setNumber);
}

const LAZY_IMAGE_ATTRS = ['srcset', 'data-srcset', 'data-sizes', 'sizes', 'data-src'];

function swapProductImage(img, setNumber, setName) {
    if (img.dataset.marstoySet === setNumber) return;

    // Remember the original so it can be put back if no set image loads.
    const original = { src: img.getAttribute('src'), alt: img.alt, attrs: {} };
    for (const attr of LAZY_IMAGE_ATTRS) {
        if (img.hasAttribute(attr)) original.attrs[attr] = img.getAttribute(attr);
    }

    const candidates = setImageUrls(setNumber);
    let index = 0;

    const restoreOriginal = () => {
        img.onerror = null;
        img.onload = null;
        for (const [attr, value] of Object.entries(original.attrs)) img.setAttribute(attr, value);
        if (original.src !== null) img.setAttribute('src', original.src);
        img.alt = original.alt;
    };

    img.dataset.marstoySet = setNumber;
    img.style.opacity = '1';
    img.style.visibility = 'visible';
    img.style.display = 'block';
    img.style.maxWidth = '100%';
    img.style.height = 'auto';

    for (const attr of LAZY_IMAGE_ATTRS) img.removeAttribute(attr);
    img.classList.remove('lazyautosizes', 'ls-is-cached', 'lazyloaded');

    img.alt = setName;
    img.loading = 'eager';
    img.onload = () => {
        img.style.opacity = '1';
        img.style.visibility = 'visible';
        img.style.display = 'block';
    };
    img.onerror = () => {
        index += 1;
        if (index < candidates.length) img.src = candidates[index];
        else restoreOriginal();
    };
    img.src = candidates[0];
}

// --- Main Enrichment Function ---
async function enrichTextNode(textNode) {
    if (hasEnrichedAncestor(textNode)) return;

    const text = textNode.textContent.trim();
    if (!text) return;

    const regex = /[MN](\d{4,6})/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
        const productCode = match[0];
        const digits = match[1];
        const reversedDigits = reverseString(digits);
        const setName = await fetchSetName(reversedDigits);
        if (!setName) continue;

        const titleElement = textNode.parentElement;
        const container = findProductContainer(textNode, productCode);
        const productImages = findProductImages(container, titleElement, productCode);

        for (const img of productImages) {
            swapProductImage(img, reversedDigits, setName);
        }

        const insertionTarget = findLinkInsertionTarget(textNode, productCode);
        const existingSelector = `a[data-marstoy-set="${reversedDigits}"]`;

        if (insertionTarget?.mode === 'after') {
            const hostParent = insertionTarget.element.parentElement;
            if (hostParent && !hostParent.querySelector(existingSelector)) {
                const linkOnly = createSetLink(reversedDigits, setName);
                linkOnly.style.marginLeft = '8px';
                insertionTarget.element.insertAdjacentElement('afterend', linkOnly);
                hostParent.classList.add(ENRICHED_CLASS);
            }
        } else if (insertionTarget?.mode === 'append') {
            if (!insertionTarget.element.querySelector(existingSelector)) {
                const linkOnly = createSetLink(reversedDigits, setName);
                linkOnly.style.marginLeft = '8px';
                insertionTarget.element.appendChild(linkOnly);
                insertionTarget.element.classList.add(ENRICHED_CLASS);
            }
        } else {
            const wrapper = document.createElement('span');
            wrapper.className = ENRICHED_CLASS;
            wrapper.style.display = 'inline-block';
            wrapper.appendChild(document.createTextNode(text));
            wrapper.appendChild(createSetLink(reversedDigits, setName));
            textNode.replaceWith(wrapper);
        }

        break; // Only one match per node
    }
}

// Page processing
async function processPage() {
    
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                // Skip script, style tags and empty nodes
                if (node.parentElement && 
                    (node.parentElement.tagName === 'SCRIPT' || 
                     node.parentElement.tagName === 'STYLE' ||
                     node.parentElement.tagName === 'NOSCRIPT')) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    const nodes = [];
    let node;
    while (node = walker.nextNode()) {
        if (node.textContent.trim()) {
            nodes.push(node);
        }
    }

    
    for (const node of nodes) {
        await enrichTextNode(node);
    }
}

// Mutation Observer setup
const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(async node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    if (node.textContent.trim()) {
                        await enrichTextNode(node);
                    }
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    // Process text nodes in the new element
                    const walker = document.createTreeWalker(
                        node,
                        NodeFilter.SHOW_TEXT,
                        null
                    );

                    while (walker.nextNode()) {
                        const textNode = walker.currentNode;
                        if (textNode.textContent.trim()) {
                            await enrichTextNode(textNode);
                        }
                    }
                }
            });
        }
    });
});

// Initialize
function init() {
    processPage();
    observer.observe(document.body, { childList: true, subtree: true });
}

// Make sure we run on both initial load and after any dynamic content loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Also try after a short delay to catch any dynamic content
setTimeout(() => {
    init();
}, 1000);
