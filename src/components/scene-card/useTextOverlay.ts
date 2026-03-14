import { useState, useRef, useCallback } from "react";
import { getPinchDist } from "./types";

interface TextOverlayState {
    x: number;
    y: number;
    scale: number;
    rotation: number;
}

export function useTextOverlay(initial: TextOverlayState) {
    const [x, setX] = useState(initial.x);
    const [y, setY] = useState(initial.y);
    const [scale, setScale] = useState(initial.scale);
    const [rotation, setRotation] = useState(initial.rotation);

    const canvasRef = useRef<HTMLDivElement>(null);
    const elRef = useRef<HTMLDivElement>(null);
    const dragOrigin = useRef<{ px: number; py: number; sx: number; sy: number } | null>(null);
    const pinchOrigin = useRef<{ 
        dist: number; 
        scale: number; 
        type?: string; 
        startAngle?: number; 
        startRotation?: number; 
        cx?: number; 
        cy?: number 
    } | null>(null);
    const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);

        const handleType = (e.target as HTMLElement).getAttribute("data-handle");
        activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        
        if (handleType === "sw" || handleType === "se") {
            const rect = e.currentTarget.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
            pinchOrigin.current = { dist: 0, scale, type: handleType, startAngle, startRotation: rotation, cx, cy };
            dragOrigin.current = null;
        } else if (handleType) {
            pinchOrigin.current = { dist: e.clientX, scale, type: handleType };
            dragOrigin.current = null;
        } else if (activePointers.current.size === 1) {
            dragOrigin.current = { px: e.clientX, py: e.clientY, sx: x, sy: y };
            pinchOrigin.current = null;
        } else if (activePointers.current.size >= 2) {
            dragOrigin.current = null;
            const [a, b] = Array.from(activePointers.current.values());
            pinchOrigin.current = { dist: getPinchDist(a, b), scale, type: "pinch" };
        }
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        e.stopPropagation();
        activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (pinchOrigin.current && (pinchOrigin.current.type === "sw" || pinchOrigin.current.type === "se")) {
            const cx = pinchOrigin.current.cx!;
            const cy = pinchOrigin.current.cy!;
            const currentAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
            
            let delta = currentAngle - pinchOrigin.current.startAngle!;
            if (delta > 180) delta -= 360;
            if (delta < -180) delta += 360;

            setRotation(pinchOrigin.current.startRotation! + delta);

        } else if (pinchOrigin.current && pinchOrigin.current.type !== "pinch") {
            const dx = e.clientX - pinchOrigin.current.dist;
            let delta = dx;
            if (pinchOrigin.current.type === "nw" || pinchOrigin.current.type === "sw") {
                delta = -dx;
            }
            const scaleDelta = delta * 0.005; 
            setScale(Math.max(0.5, Math.min(4.0, pinchOrigin.current.scale + scaleDelta)));

        } else if (activePointers.current.size >= 2 && pinchOrigin.current && pinchOrigin.current.type === "pinch") {
            const [a, b] = Array.from(activePointers.current.values());
            const newDist = getPinchDist(a, b);
            const ratio = newDist / pinchOrigin.current.dist;
            setScale(Math.max(0.5, Math.min(4.0, pinchOrigin.current.scale * ratio)));
            
        } else if (activePointers.current.size === 1 && dragOrigin.current && canvasRef.current) {
            const rect = canvasRef.current.getBoundingClientRect();
            const dx = (e.clientX - dragOrigin.current.px) / rect.width * 100;
            const dy = (e.clientY - dragOrigin.current.py) / rect.height * 100;
            setX(Math.max(5, Math.min(95, dragOrigin.current.sx + dx)));
            setY(Math.max(5, Math.min(95, dragOrigin.current.sy + dy)));
        }
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        e.stopPropagation();
        activePointers.current.delete(e.pointerId);
        if (activePointers.current.size < 2) pinchOrigin.current = null;
        if (activePointers.current.size === 0) dragOrigin.current = null;
    };

    return {
        x, y, scale, rotation,
        setX, setY, setScale, setRotation,
        canvasRef, elRef,
        handlePointerDown,
        handlePointerMove,
        handlePointerUp
    };
}
