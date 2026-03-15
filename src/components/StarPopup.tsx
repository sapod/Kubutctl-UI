import React, { useState, useEffect } from "react";
import { useTheme } from "../contexts/ThemeContext";

const StarSVG = ({ size = 16, color = "#BA7517" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <path d="M12 2l2.9 6.4 6.9.6-5.1 4.6 1.6 6.8L12 17l-6.3 3.4 1.6-6.8L2.2 9l6.9-.6z" />
    </svg>
);

const StarPopup = ({ repoUrl = "https://github.com/your/repo", delay = 3000, onDismiss, onStar }: { repoUrl?: string; delay?: number; onDismiss?: () => void; onStar?: () => void }) => {
    const { theme } = useTheme();
    const isDark = theme === "dark";
    const [visible, setVisible] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const [thanked, setThanked] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => setVisible(true), delay);
        return () => clearTimeout(t);
    }, [delay]);

    const openInDefaultBrowser = async (url: string) => {
        const electron = (window as any).electron;
        if (electron && typeof electron.executeCommand === 'function') {
            try {
                const platform = electron.platform || 'darwin';
                let command = '';
                if (platform === 'darwin') {
                    command = `open "${url}"`;
                } else if (platform === 'win32') {
                    command = `start "" "${url}"`;
                } else {
                    command = `xdg-open "${url}"`;
                }
                await electron.executeCommand(command);
            } catch (err) {
                console.error('Failed to open browser:', err);
            }
        } else {
            window.open(url, '_blank');
        }
    };

    const dismiss = (starred = false) => {
        setVisible(false);
        setDismissed(true);
        onDismiss?.();
        if (starred) {
            onStar?.();
            setThanked(true);
            setTimeout(() => {
                openInDefaultBrowser(repoUrl);
            }, 1200);
            setTimeout(() => {
                setThanked(false);
            }, 3000);
        }
    };

    if (dismissed && !thanked) return null;

    const popupStyle: React.CSSProperties = {
        ...styles.popup,
        background: isDark ? "#1f2937" : "#ffffff",
        border: isDark ? "0.5px solid rgba(255,255,255,0.12)" : "0.5px solid rgba(0,0,0,0.12)",
        boxShadow: isDark ? "0 4px 24px rgba(0,0,0,0.4)" : "0 4px 24px rgba(0,0,0,0.08)",
    };

    const iconBoxStyle: React.CSSProperties = {
        ...styles.iconBox,
        background: isDark ? "#374151" : "#FAEEDA",
    };

    const titleStyle: React.CSSProperties = {
        ...styles.title,
        color: isDark ? "#f3f4f6" : "#111",
    };

    const subStyle: React.CSSProperties = {
        ...styles.sub,
        color: isDark ? "#9ca3af" : "#666",
    };

    const btnDismissStyle: React.CSSProperties = {
        ...styles.btnDismiss,
        border: isDark ? "0.5px solid rgba(255,255,255,0.18)" : "0.5px solid rgba(0,0,0,0.18)",
        color: isDark ? "#9ca3af" : "#555",
    };

    const thanksStyle: React.CSSProperties = {
        ...styles.thanks,
        color: isDark ? "#6b7280" : "#888",
    };

    return (
        <div style={styles.wrapper}>
            <div
                style={{
                    ...popupStyle,
                    transform: visible ? "translateY(0)" : "translateY(-80px)",
                    opacity: visible ? 1 : 0,
                    pointerEvents: visible ? "auto" : "none",
                }}
            >
                <div style={iconBoxStyle}>
                    <StarSVG />
                </div>
                <div style={styles.text}>
                    <p style={titleStyle}>Finding this tool useful?</p>
                    <p style={subStyle}>A star on GitHub helps us reach more people.</p>
                </div>
                <div style={styles.actions}>
                    <button
                        style={{
                            ...styles.btnStar,
                            background: isDark ? "#3b82f6" : "#2563eb",
                        }}
                        onClick={() => dismiss(true)}
                    >
                        <StarSVG size={11} color="currentColor" /> Star
                    </button>
                    <button style={btnDismissStyle} onClick={() => dismiss(false)}>
                        Not now
                    </button>
                </div>
            </div>

            {thanked && <p style={thanksStyle}>Thanks so much! You rock. ✨</p>}
        </div>
    );
};

const styles: Record<string, React.CSSProperties> = {
    wrapper: {
        position: "fixed",
        top: 8,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        pointerEvents: "none",
    },
    popup: {
        pointerEvents: "auto",
        background: "#ffffff",
        border: "0.5px solid rgba(0,0,0,0.12)",
        borderRadius: 16,
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        maxWidth: 460,
        minWidth: 0,
        width: "calc(100vw - 32px)",
        boxSizing: "border-box",
        boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        transition: "transform 0.42s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease",
    },
    iconBox: {
        width: 34,
        height: 34,
        background: "#FAEEDA",
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    text: {
        flex: 1,
        minWidth: 0,
    },
    title: {
        margin: "0 0 2px",
        fontSize: 13.5,
        fontWeight: 500,
        color: "#111",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
    sub: {
        margin: 0,
        fontSize: 12,
        color: "#666",
        lineHeight: 1.4,
    },
    actions: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexShrink: 0,
    },
    btnStar: {
        fontSize: 13,
        fontWeight: 500,
        background: "#111",
        color: "#fff",
        border: "none",
        borderRadius: 8,
        padding: "6px 12px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 5,
        whiteSpace: "nowrap",
    },
    btnDismiss: {
        fontSize: 12,
        background: "none",
        border: "0.5px solid rgba(0,0,0,0.18)",
        color: "#555",
        borderRadius: 8,
        padding: "6px 9px",
        cursor: "pointer",
        whiteSpace: "nowrap",
    },
    thanks: {
        pointerEvents: "none",
        fontSize: 12.5,
        color: "#888",
        margin: 0,
    },
};

export default StarPopup;