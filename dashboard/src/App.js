// src/App.js - Înlocuiește în dashboard/src/App.js

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Loader2, Moon, Sun } from 'lucide-react';

/* =========================
   APP COMPONENT
========================= */

function App() {
    const [urls, setUrls] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [analyzeWithCookies, setAnalyzeWithCookies] = useState(false);
    const [theme, setTheme] = useState('dark');

    /* =========================
       THEME HANDLING
    ========================= */

    useEffect(() => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [theme]);

    const toggleTheme = () => {
        setTheme(theme === 'light' ? 'dark' : 'light');
    };

    /* =========================
       HELPERS
    ========================= */

    const isColorDark = (hexColor) => {
        if (!hexColor.startsWith('#')) return false;

        const hex = hexColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);

        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance < 0.5;
    };

    /* Helper: color swatch inline */
    const ColorSwatch = ({ color }) => {
        if (!color || !color.startsWith('#')) return null;
        return (
            <span
                className="inline-block w-3 h-3 rounded-sm border border-gray-300 dark:border-gray-600"
                style={{ backgroundColor: color }}
            />
        );
    };

    /* Helper: WCAG status badge */
    const StatusBadge = ({ status }) => {
        const cls = status === 'PASS'
            ? 'text-green-700 dark:text-green-400'
            : status === 'FAIL'
            ? 'text-red-700 dark:text-red-400'
            : 'text-yellow-600 dark:text-yellow-400';
        return <span className={`font-mono font-bold ${cls}`}>{status}</span>;
    };

    /* =========================
       FORM SUBMIT
    ========================= */

    const analyzeCompetitors = async (e) => {
        e.preventDefault();

        if (!urls.trim()) {
            setError('Te rog introdu cel puțin un URL');
            return;
        }

        setLoading(true);
        setError('');
        setResults([]);

        try {
            const response = await axios.post('http://localhost:3001/analyze', {
                urls: urls,
                keepCookies: analyzeWithCookies,
            });

            setResults(response.data);
        } catch (err) {
            setError(
                'A apărut o eroare: ' +
                    (err.response?.data?.error || err.message)
            );
        } finally {
            setLoading(false);
        }
    };

    /* =========================
       COMPETITOR CARD
    ========================= */

    const CompetitorCard = ({ data }) => {
        if (data.error) {
            return (
                <div className="bg-red-100 dark:bg-red-900 border-l-4 border-red-500 text-red-700 dark:text-red-200 p-4 rounded-lg shadow-md">
                    <h3 className="font-bold text-lg break-all mb-2">
                        {data.url}
                    </h3>
                    <p className="font-semibold">Analiza a eșuat</p>
                    <p className="text-sm">{data.error}</p>
                </div>
            );
        }

        /* =========================
           ACCESSIBILITY ISSUES
        ========================= */

        const rawIssues = data?.accessibility?.contrastIssues || [];

        const normalized = rawIssues.map((issue) => {
            const textColor = issue.textColor || '#000000';

            const effectiveBg =
                issue.effectiveBg ||
                issue.bgComputed ||
                issue.bgVisual ||
                issue.firstBg ||
                issue.maxAreaBg ||
                issue.dominantBg ||
                '#FFFFFF';

            const contrast =
                issue.contrastUsed ||
                issue.contrastRatio ||
                issue.contrastComputed ||
                issue.contrastVisual ||
                issue.firstContrast ||
                issue.maxAreaContrast ||
                issue.dominantContrast ||
                null;

            const aa = issue.AA || null;
            const aaa = issue.AAA || null;

            const isFail =
                (aa && aa.status === 'FAIL') ||
                (aaa && aaa.status === 'FAIL');

            return {
                original: issue,
                text: issue.text,
                textColor,
                bgColor: effectiveBg,
                contrast,
                aaRequired: aa?.required || '4.50:1',
                aaStatus: aa?.status || 'UNKNOWN',
                aaaRequired: aaa?.required || '7.00:1',
                aaaStatus: aaa?.status || 'UNKNOWN',
                method: issue.method,
                note: issue.note,
                previewBase64: issue.previewBase64,
                isFail,
            };
        });

        const failOnly = normalized.filter((i) => i.isFail);

        /* =========================
           NON-TEXT → merged into same list
           Show elements that have at least one problem:
           - FAIL on any WCAG check
           - WARNING status
           - Empty alt on non-icon elements
           - Element disappears on sticky scroll (normalBgColor exists but stickyBgColor is null)
        ========================= */

        const nonTextElements = data?.nonTextElements || [];
        const typeLabels = {
            'icon-bg-image': 'Iconiță CSS',
            'social-icon': 'Social Media',
            'partner-logo': 'Logo Partener',
            'ui-control': 'Control UI',
        };

        const nonTextAsIssues = nonTextElements.map((el) => {
            const aaStatus = el.wcag1411?.status || 'WARNING';
            const aaaStatus = el.enhanced?.status || '—';
            const stickyAaStatus = el.stickyWcag1411?.status || null;
            const stickyEnhStatus = el.stickyEnhanced?.status || null;
            const hasEmptyAlt = el.alt === '' && el.type !== 'icon-bg-image';

            // Check if element disappears on sticky scroll
            // (has a normal background but sticky variant is null/hidden)
            const disappearsOnSticky = !!(el.normalBgColor && !el.stickyBgColor && el.stickyBgColor !== undefined);

            // Check if ANY status is FAIL
            const hasFail =
                aaStatus === 'FAIL' ||
                aaaStatus === 'FAIL' ||
                stickyAaStatus === 'FAIL' ||
                stickyEnhStatus === 'FAIL';

            // Check if ANY status is WARNING or element disappears on scroll
            const hasWarning =
                aaStatus === 'WARNING' ||
                stickyAaStatus === 'WARNING' ||
                disappearsOnSticky;

            // Severity: 'red' if any FAIL, 'yellow' if WARNING/alt=""/disappears, 'none' if all good
            let severity;
            if (hasFail) {
                severity = 'red';
            } else if (hasWarning || hasEmptyAlt) {
                severity = 'yellow';
            } else {
                severity = 'none';
            }

            return {
                isNonText: true,
                nonTextType: el.type,
                text: el.label,
                textColor: el.estimatedColor || null,
                bgColor: el.bgColor || 'unknown',
                contrast: el.contrastRatio || null,
                aaRequired: '3.0:1',
                aaStatus,
                aaaRequired: '4.5:1',
                aaaStatus,
                note: el.note || '',
                previewBase64: el.previewBase64 || null,
                stickyPreviewBase64: el.stickyPreviewBase64 || null,
                stickyBgColor: el.stickyBgColor || null,
                normalBgColor: el.normalBgColor || null,
                stickyContrastRatio: el.stickyContrastRatio || null,
                stickyWcag1411: el.stickyWcag1411 || null,
                stickyEnhanced: el.stickyEnhanced || null,
                disappearsOnSticky,
                isFail: severity !== 'none',
                severity,
                typeLabel: typeLabels[el.type] || el.type,
                alt: el.alt,
                href: el.href || null,
            };
        }).filter((el) => el.isFail);

        const allIssues = [...failOnly, ...nonTextAsIssues];

        return (
            <div className="bg-white border border-transparent p-4 rounded-lg shadow-md dark:bg-gray-950 dark:border-gray-700">
                <h3 className="font-bold text-lg break-all mb-2 text-gray-900 dark:text-gray-100">
                    {data.url}
                </h3>

                <h4 className="font-semibold text-gray-700 dark:text-gray-300 mt-4 dark:border-gray-100">
                    Raport de Accesibilitate (Contrast Culori)
                </h4>

                {allIssues.length > 0 ? (
                    <div className="mt-2 space-y-3">
                        {allIssues.map((issue, index) => {
                            const showContrast = issue.contrast
                                ? issue.contrast
                                : '?';
                            
                            const hasImage = !!issue.previewBase64;
                            const isNonText = !!issue.isNonText;
                            const hasStickyVariant = isNonText && !!issue.stickyPreviewBase64;

                            const borderClass = isNonText
                                ? (issue.severity === 'red'
                                    ? 'border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/30'
                                    : 'border-yellow-200 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/30')
                                : 'border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/30';

                            let headerLabel, headerColor;
                            if (isNonText) {
                                headerLabel = `Element Non-text — ${issue.typeLabel}`;
                                headerColor = issue.severity === 'red'
                                    ? 'text-red-800 dark:text-red-300'
                                    : 'text-yellow-800 dark:text-yellow-300';
                            } else {
                                headerLabel = hasImage ? 'Problemă pe fundal Imagine:' : 'Problemă de contrast detectată:';
                                headerColor = 'text-red-800 dark:text-red-300';
                            }

                            return (
                                <div
                                    key={index}
                                    className={`border ${borderClass} p-3 rounded-lg`}
                                >
                                    <p className={`text-sm font-semibold ${headerColor}`}>
                                        {headerLabel}
                                    </p>

                                    {/* ============================================
                                        NON-TEXT WITH STICKY VARIANT (2 backgrounds)
                                       ============================================ */}
                                    {hasStickyVariant ? (
                                        <>
                                            {/* --- Normal variant (before scroll) --- */}
                                            <div className="mt-2 mb-2">
                                                <div className="text-xs text-gray-700 space-y-1 mb-1 dark:text-gray-400 dark:space-y-1">
                                                    <div className="font-mono font-bold flex items-center gap-1">
                                                        Bg înainte de scroll:
                                                        <ColorSwatch color={issue.bgColor} />
                                                        <span>{issue.bgColor}</span>
                                                    </div>
                                                    <p>
                                                        <strong>WCAG 1.4.11 (3:1): </strong>
                                                        <StatusBadge status={issue.aaStatus} />
                                                        {issue.contrast && (
                                                            <span className="font-mono ml-1 text-gray-500">({issue.contrast}:1)</span>
                                                        )}
                                                    </p>
                                                    {issue.aaaStatus && issue.aaaStatus !== '—' && (
                                                        <p>
                                                            <strong>Enhanced (cerință 4.5:1): </strong>
                                                            <StatusBadge status={issue.aaaStatus} />
                                                        </p>
                                                    )}
                                                </div>
                                                {hasImage && (
                                                    <div className="flex justify-center">
                                                        <img src={issue.previewBase64} alt={`${issue.text} - normal`}
                                                            className="max-h-[70px] max-w-full rounded border border-gray-200 dark:border-gray-600 object-contain" />
                                                    </div>
                                                )}
                                            </div>

                                            {/* --- Sticky variant (after scroll) --- */}
                                            <div className="mb-2 pt-2 border-t border-gray-700 dark:border-gray-400">
                                                <div className="text-xs text-gray-700 space-y-1 mb-1 dark:text-gray-400 dark:space-y-1">
                                                    <div className="font-mono font-bold flex items-center gap-1">
                                                        La scroll:
                                                        <ColorSwatch color={issue.stickyBgColor} />
                                                        <span>Bg: {issue.stickyBgColor}</span>
                                                    </div>
                                                    <p>
                                                        <strong>WCAG 1.4.11 (3:1): </strong>
                                                        <StatusBadge status={issue.stickyWcag1411?.status || 'WARNING'} />
                                                        {issue.stickyContrastRatio && (
                                                            <span className="font-mono ml-1 text-gray-500">({issue.stickyContrastRatio}:1)</span>
                                                        )}
                                                    </p>
                                                    {issue.stickyEnhanced && (
                                                        <p>
                                                            <strong>Enhanced (cerință 4.5:1): </strong>
                                                            <StatusBadge status={issue.stickyEnhanced.status} />
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="flex justify-center">
                                                    <img src={issue.stickyPreviewBase64} alt={`${issue.text} - sticky`}
                                                        className="max-h-[70px] max-w-full rounded border border-gray-200 dark:border-gray-600 object-contain" />
                                                </div>
                                            </div>

                                            {/* --- Common info (icon, alt, note, link) --- */}
                                            <div className="text-xs text-gray-700 dark:text-gray-400 space-y-1">
                                                {issue.textColor && (
                                                    <div className="font-mono font-bold flex items-center gap-1">
                                                        Icon:
                                                        <ColorSwatch color={issue.textColor} />
                                                        <span>{issue.textColor}</span>
                                                    </div>
                                                )}

                                                {issue.alt === '' && issue.nonTextType !== 'icon-bg-image' && (
                                                    <p className="text-orange-600 dark:text-orange-400 italic text-[11px]">
                                                        ⚠ alt="" — linkul poate fi inaccesibil pentru screen readers
                                                    </p>
                                                )}

                                                {issue.note && (
                                                    <p className="italic text-[11px] text-gray-500 dark:text-gray-500">
                                                        Notă: {issue.note}
                                                    </p>
                                                )}

                                                {issue.href && (
                                                    <p className="text-[11px] truncate">
                                                        <strong>Link: </strong>
                                                        <a href={issue.href} target="_blank" rel="noopener noreferrer"
                                                            className="text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300"
                                                            title={issue.href}>
                                                            {issue.href}
                                                        </a>
                                                    </p>
                                                )}
                                            </div>
                                        </>

                                    /* ============================================
                                       NON-TEXT WITHOUT STICKY — includes disappears-on-sticky
                                       ============================================ */
                                    ) : isNonText ? (
                                        <>
                                            {/* Preview */}
                                            {hasImage && (
                                                <div className="my-2 flex justify-center">
                                                    <img src={issue.previewBase64} alt={issue.text}
                                                        className="max-h-[70px] max-w-full rounded border border-gray-200 dark:border-gray-600 object-contain" />
                                                </div>
                                            )}

                                            {/* Disappears on sticky warning */}
                                            {issue.disappearsOnSticky && (
                                                <p className="text-orange-600 dark:text-orange-400 italic text-[11px] my-1">
                                                    ⚠ Elementul dispare la scroll (ascuns în starea sticky)
                                                </p>
                                            )}

                                            {/* WCAG + info */}
                                            <div className="text-xs text-gray-700 dark:text-gray-400 space-y-1">
                                                <p>
                                                    <strong>WCAG 1.4.11 (3:1): </strong>
                                                    <StatusBadge status={issue.aaStatus} />
                                                    {issue.contrast && (
                                                        <span className="font-mono ml-1 text-gray-500">({issue.contrast}:1)</span>
                                                    )}
                                                </p>

                                                {issue.aaaStatus && issue.aaaStatus !== '—' && (
                                                    <p>
                                                        <strong>Enhanced (cerință {issue.aaaRequired}): </strong>
                                                        <StatusBadge status={issue.aaaStatus} />
                                                    </p>
                                                )}

                                                {issue.textColor && (
                                                    <div className="font-mono font-bold flex items-center gap-1">
                                                        Icon:
                                                        <ColorSwatch color={issue.textColor} />
                                                        <span>{issue.textColor}</span>
                                                    </div>
                                                )}
                                                <div className="font-mono font-bold flex items-center gap-1">
                                                    Bg:
                                                    <ColorSwatch color={issue.bgColor} />
                                                    <span>{issue.bgColor}</span>
                                                </div>

                                                {issue.alt === '' && issue.nonTextType !== 'icon-bg-image' && (
                                                    <p className="text-orange-600 dark:text-orange-400 italic text-[11px]">
                                                        ⚠ alt="" — linkul poate fi inaccesibil pentru screen readers
                                                    </p>
                                                )}

                                                {issue.note && (
                                                    <p className="italic text-[11px] text-gray-500 dark:text-gray-500">
                                                        Notă: {issue.note}
                                                    </p>
                                                )}

                                                {issue.href && (
                                                    <p className="text-[11px] truncate">
                                                        <strong>Link: </strong>
                                                        <a href={issue.href} target="_blank" rel="noopener noreferrer"
                                                            className="text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300"
                                                            title={issue.href}>
                                                            {issue.href}
                                                        </a>
                                                    </p>
                                                )}
                                            </div>
                                        </>

                                    /* ============================================
                                       TEXT CONTRAST ISSUES (original layout)
                                       ============================================ */
                                    ) : (
                                        <>
                                            {/* Text preview box */}
                                            <div
                                                className="my-2 p-2 rounded text-center text-lg relative overflow-hidden flex items-center justify-center min-h-[80px]"
                                                style={{
                                                    backgroundColor: issue.bgColor,
                                                    color: issue.textColor,
                                                    backgroundImage: hasImage ? `url(${issue.previewBase64})` : 'none',
                                                    backgroundSize: 'cover',
                                                    backgroundPosition: 'center',
                                                    backgroundRepeat: 'no-repeat'
                                                }}
                                            >
                                                {!hasImage && issue.text}
                                                {hasImage && <div className="absolute inset-0" title={issue.text}></div>}
                                            </div>

                                            {/* Text contrast info */}
                                            <div className="text-xs text-gray-700 dark:text-gray-400 space-y-1">
                                                <p>
                                                    <strong>Contrast (folosit): </strong>
                                                    <span className={`font-mono font-bold ${
                                                        issue.aaStatus === 'FAIL' ? 'text-red-700 dark:text-red-400'
                                                        : issue.aaStatus === 'WARNING' ? 'text-yellow-600 dark:text-yellow-400'
                                                        : 'text-green-700 dark:text-green-400'
                                                    }`}>
                                                        {showContrast ? `${showContrast}${isNaN(showContrast) ? '' : ':1'}` : 'n/a'}
                                                    </span>
                                                </p>

                                                <p>
                                                    <strong>
                                                        AA (cerință{' '}
                                                        {issue.aaRequired}):{' '}
                                                    </strong>
                                                    <span
                                                        className={`font-mono font-bold ${
                                                            issue.aaStatus === 'FAIL'
                                                                ? 'text-red-700 dark:text-red-400'
                                                                : issue.aaStatus === 'WARNING' 
                                                                    ? 'text-yellow-600 dark:text-yellow-400'
                                                                    : 'text-green-700 dark:text-green-400'
                                                        }`}
                                                    >
                                                        {issue.aaStatus}
                                                    </span>
                                                </p>

                                                <p>
                                                    <strong>
                                                        AAA (cerință{' '}
                                                        {issue.aaaRequired}):{' '}
                                                    </strong>
                                                    <span
                                                        className={`font-mono font-bold ${
                                                            issue.aaaStatus === 'FAIL'
                                                                ? 'text-red-700 dark:text-red-400'
                                                                : 'text-green-700 dark:text-green-400'
                                                        }`}
                                                    >
                                                        {issue.aaaStatus}
                                                    </span>
                                                </p>

                                                {issue.method && (
                                                    <p>
                                                        <strong>Metodă: </strong>
                                                        <span className="font-mono">
                                                            {issue.method}
                                                        </span>
                                                    </p>
                                                )}

                                                <div className='font-mono font-bold flex items-center gap-1'>
                                                    Text:
                                                    <ColorSwatch color={issue.textColor} />
                                                    <span className="font-mono font-bold">{issue.textColor}</span>
                                                </div>
                                                <div className='font-mono font-bold flex items-center gap-1'>
                                                    Bg:
                                                    <ColorSwatch color={issue.bgColor} />
                                                    <span className="font-mono font-bold">{issue.bgColor}</span>
                                                </div>

                                                {issue.note && (
                                                    <p className="italic text-[11px] text-gray-500 dark:text-gray-500">
                                                        Notă: {issue.note}
                                                    </p>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="mt-2 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg">
                        <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                            Felicitări! Nu au fost găsite probleme majore de
                            contrast al culorilor.
                        </p>
                    </div>
                )}

                <h4 className="font-semibold text-gray-700 dark:text-gray-300 mt-4">
                    Culori de Fundal (după suprafața vizibilă)
                </h4>

                <div className="space-y-2 mt-2">
                    {data.backgrounds &&
                        data.backgrounds.map((item, index) => (
                            <div
                                key={index}
                                className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-6 relative overflow-hidden"
                            >
                                <div
                                    className="h-6 rounded-full absolute top-0 left-0"
                                    style={{
                                        width: `${item.percentage}%`,
                                        backgroundColor: item.color,
                                    }}
                                ></div>

                                <div className="absolute top-0 left-0 w-full h-full flex items-center justify-between px-2">
                                    <span
                                        className={`text-xs font-bold ${
                                            isColorDark(item.color)
                                                ? 'text-white'
                                                : 'text-black'
                                        }`}
                                    >
                                        {item.color}
                                    </span>

                                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                                        {item.percentage}%
                                    </span>
                                </div>
                            </div>
                        ))}
                </div>

                <h4 className="font-semibold text-gray-700 dark:text-gray-300 mt-4">
                    Culori de Text (după relevanță)
                </h4>

                <ul className="list-none mb-4">
                    {data.colors &&
                        data.colors.map((item, index) => (
                            <li
                                key={index}
                                className="flex items-start mb-2"
                            >
                                <div
                                    className="w-5 h-5 rounded-full mr-2 border border-gray-300 dark:border-gray-600 flex-shrink-0"
                                    style={{
                                        backgroundColor: item.color,
                                    }}
                                ></div>

                                <div>
                                    <span className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">
                                        {item.color}
                                    </span>

                                    <div
                                        className="text-xs text-gray-500 dark:text-gray-400 italic truncate"
                                        title={item.elements.join(' ')}
                                    >
                                        Folosit de:{' '}
                                        {item.elements.join(', ')}
                                    </div>
                                </div>
                            </li>
                        ))}
                </ul>

                <h4 className="font-semibold text-gray-700 dark:text-gray-300 mt-4">
                    Fonturi Principale
                </h4>

                <ul className="list-none">
                    {data.fonts &&
                        data.fonts
                            .filter(font => font.font && !font.font.startsWith("N/A"))
                            .map((font, index) => (
                                <li key={index} className="text-sm text-gray-700 dark:text-gray-300">
                                    <span className="font-semibold">{font.font}</span>
                                    <span className="text-gray-500 dark:text-gray-400 ml-1">
                                        ({font.weights ? font.weights.join(', ') : font.count})
                                    </span>
                                </li>
                            ))}
                </ul>

                {/* =========================
                    SITE LOGO
                ========================= */}
                {data.siteLogo && (
                    <>
                        <h4 className="font-semibold text-gray-700 dark:text-gray-300 mt-4">
                            Logo Site
                        </h4>
                        <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg">
                            <div className="flex justify-center mb-2">
                                <img
                                    src={data.siteLogo.base64}
                                    alt="Site logo"
                                    className="max-h-[80px] max-w-full object-contain rounded"
                                />
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                                {data.siteLogo.width} × {data.siteLogo.height}px
                            </p>
                        </div>
                    </>
                )}

                {/* =========================
                    TOP IMAGES
                ========================= */}
                {data.topImages && data.topImages.length > 0 && (
                    <>
                        <h4 className="font-semibold text-gray-700 dark:text-gray-300 mt-4">
                            Primele {data.topImages.length} Imagini (după dimensiune)
                        </h4>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                            {data.topImages.map((img, index) => (
                                <div
                                    key={index}
                                    className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-2"
                                >
                                    <div className="flex justify-center mb-1">
                                        <img
                                            src={img.base64}
                                            alt={img.alt || `Image ${index + 1}`}
                                            className="max-h-[100px] max-w-full object-contain rounded"
                                        />
                                    </div>
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 text-center truncate" title={img.alt}>
                                        {img.width} × {img.height}px
                                        {img.alt ? ` — ${img.alt}` : ''}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        );
    };

    /* =========================
       RENDER
    ========================= */

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-950 p-4 md:p-8">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-stone-100">
                        Introdu URL-urile Competitorilor
                    </h1>

                    <button
                        onClick={toggleTheme}
                        className="bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-bold py-2 px-4 rounded-lg transition duration-300 ease-in-out transform hover:scale-105 flex items-center"
                    >
                        {theme === 'light' ? (
                            <Moon className="w-5 h-5 mr-2" />
                        ) : (
                            <Sun className="w-5 h-5 mr-2" />
                        )}
                        {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
                    </button>
                </div>

                <form
                    onSubmit={analyzeCompetitors}
                    className="bg-white border-transparent p-4 rounded-lg shadow-md dark:bg-gray-950 dark:border dark:border-gray-700 dark:rounded-lg dark:shadow-md"
                >
                    <textarea
                        value={urls}
                        onChange={(e) => setUrls(e.target.value)}
                        rows={4}
                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                        placeholder="ex: https://competitor1.com, https://competitor2.com"
                        disabled={loading}
                    />

                    <div className="mt-3 flex items-center mb-3">
                        <div className="relative">
                            <input
                                type="checkbox"
                                id="cookies"
                                name="cookies"
                                checked={analyzeWithCookies}
                                onChange={(e) =>
                                    setAnalyzeWithCookies(
                                        e.target.checked
                                    )
                                }
                                className="sr-only peer"
                            />

                            <label
                                htmlFor="cookies"
                                className="relative h-5 w-5 cursor-pointer flex items-center justify-center rounded-md border border-gray-300 bg-white peer-checked:bg-white peer-checked:border-gray-300 dark:border-gray-600 dark:bg-gray-950 dark:peer-checked:bg-gray-950 dark:peer-checked:border-gray-600 transition-all"
                            >
                                {analyzeWithCookies && (
                                    <svg
                                        className="w-4 h-4 text-gray-900 dark:text-gray-100"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={3}
                                            d="M5 13l4 4L19 7"
                                        />
                                    </svg>
                                )}
                            </label>
                        </div>

                        <label
                            htmlFor="cookies"
                            className="cursor-pointer ml-2 text-gray-700 dark:text-gray-300 font-medium"
                        >
                            Analyze with cookie footer
                        </label>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="relative mt-2 bg-custom-color dark:bg-blue-800 text-white font-bold py-2 px-4 rounded-lg transition duration-300 ease-in-out transform hover:scale-105"
                    >
                        <span
                            className={
                                loading ? 'opacity-0' : 'opacity-100'
                            }
                        >
                            Generează Raport
                        </span>

                        {loading && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Loader2 className="w-5 h-5 animate-spin" />
                            </div>
                        )}
                    </button>
                </form>

                {error && (
                    <div
                        className="mt-4 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded relative"
                        role="alert"
                    >
                        <strong className="font-bold">Eroare: </strong>
                        <span className="block sm:inline">{error}</span>
                    </div>
                )}

                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 pt-4">
                    {results.map((result) => (
                        <CompetitorCard key={result.url} data={result} />
                    ))}
                </div>
            </div>
        </div>
    );
}

export default App;
