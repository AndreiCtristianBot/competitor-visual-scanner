export type BackgroundEntry = {
    color: string;
    surface: number;
    percentage: string;
    type: 'color';
};
export type ImageEntry = {
    src: string;
    type: 'image' | 'video' | 'canvas';
    areaPercent: string;
};
export type ContrastIssue = {
    text: string;
    textColor: string | null;
    effectiveBg: string | null;
    contrastUsed: string | null;
    AA: {
        required: string;
        status: 'PASS' | 'FAIL' | 'WARNING';
    };
    AAA: {
        required: string;
        status: 'PASS' | 'FAIL';
    };
    note?: string;
    previewBase64?: string | undefined;
};
export type NonTextElement = {
    type: 'icon-bg-image' | 'social-icon' | 'partner-logo' | 'ui-control';
    label: string;
    tagName: string;
    src?: string | undefined;
    alt?: string | undefined;
    cssFilter?: string | undefined;
    estimatedColor?: string | undefined;
    bgColor: string;
    contrastRatio?: string | undefined;
    wcag1411: {
        required: '3.0:1';
        status: 'PASS' | 'FAIL' | 'WARNING';
    };
    enhanced?: {
        required: '4.5:1';
        status: 'PASS' | 'FAIL';
    } | undefined;
    rect: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    href?: string | undefined;
    previewBase64?: string | undefined;
    stickyPreviewBase64?: string | undefined;
    stickyBgColor?: string | undefined;
    normalBgColor?: string | undefined;
    stickyContrastRatio?: string | undefined;
    stickyWcag1411?: {
        required: '3.0:1';
        status: 'PASS' | 'FAIL' | 'WARNING';
    } | undefined;
    stickyEnhanced?: {
        required: '4.5:1';
        status: 'PASS' | 'FAIL';
    } | undefined;
    note?: string | undefined;
};
export type AnalysisResult = {
    url: string;
    backgrounds: BackgroundEntry[];
    images: ImageEntry[];
    textColors: {
        color: string;
        score: number;
        elements: string[];
    }[];
    colors: {
        color: string;
        score: number;
        elements: string[];
    }[];
    fonts: {
        font: string;
        weights?: string[];
        count?: number;
    }[];
    accessibility: {
        summary: {
            totalTextNodes: number;
            issuesAA: number;
            issuesAAA: number;
        };
        contrastIssues: ContrastIssue[];
    };
    nonTextElements?: NonTextElement[] | undefined;
    siteLogo?: {
        src: string;
        base64: string;
        width: number;
        height: number;
    } | null | undefined;
    topImages?: {
        src: string;
        alt: string;
        base64: string;
        width: number;
        height: number;
    }[] | undefined;
    error?: string | undefined;
};
export type CaptureData = {
    buffer: Buffer;
    index: number;
    x: number;
};
export type SiteStrategy = 'VERTICAL_SNAP' | 'HORIZONTAL_APP' | 'STANDARD';
export type AnalyzeOptions = {
    keepCookies?: boolean;
    prefersColorScheme?: 'light' | 'dark' | 'none';
};
//# sourceMappingURL=types.d.ts.map