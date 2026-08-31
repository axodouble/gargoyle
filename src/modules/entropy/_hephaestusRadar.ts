import { createCanvas } from 'canvas';

export interface HephaestusRadarAxis {
    label: string;
    value: number;
}

const SIZE = 512;
const RADIUS = 175;
const BACKGROUND = '#232428';
const GRID_MAJOR = 'rgba(255, 255, 255, 0.4)';
const GRID_MINOR = 'rgba(255, 255, 255, 0.12)';
const SPOKE = 'rgba(255, 255, 255, 0.2)';
const POLYGON_FILL = 'rgba(88, 101, 242, 0.35)';
const POLYGON_STROKE = '#5865f2';
const LABEL = '#ffffff';

function point(center: number, radius: number, angle: number): { x: number; y: number } {
    return { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) };
}

export function renderRadarChart(axes: HephaestusRadarAxis[]): Buffer {
    const canvas = createCanvas(SIZE, SIZE);
    const ctx = canvas.getContext('2d');
    const center = SIZE / 2;
    const count = axes.length;
    const angleStep = (Math.PI * 2) / count;
    const startAngle = -Math.PI / 2;

    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, SIZE, SIZE);

    for (const level of [25, 50, 75, 100]) {
        const ringRadius = (RADIUS * level) / 100;
        ctx.beginPath();
        for (let i = 0; i <= count; i++) {
            const { x, y } = point(center, ringRadius, startAngle + (i % count) * angleStep);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = level === 100 ? GRID_MAJOR : GRID_MINOR;
        ctx.lineWidth = level === 100 ? 2 : 1;
        ctx.stroke();
    }

    for (let i = 0; i < count; i++) {
        const { x, y } = point(center, RADIUS, startAngle + i * angleStep);
        ctx.beginPath();
        ctx.moveTo(center, center);
        ctx.lineTo(x, y);
        ctx.strokeStyle = SPOKE;
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    ctx.beginPath();
    for (let i = 0; i <= count; i++) {
        const value = Math.min(100, Math.max(0, axes[i % count].value));
        const { x, y } = point(center, (RADIUS * value) / 100, startAngle + (i % count) * angleStep);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = POLYGON_FILL;
    ctx.fill();
    ctx.strokeStyle = POLYGON_STROKE;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.fillStyle = LABEL;
    ctx.font = 'bold 24px sans-serif';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < count; i++) {
        const angle = startAngle + i * angleStep;
        const { x, y } = point(center, RADIUS + 36, angle);
        if (angle === -Math.PI / 2 || angle === Math.PI / 2) ctx.textAlign = 'center';
        else if (angle > -Math.PI / 2 && angle < Math.PI / 2) ctx.textAlign = 'left';
        else ctx.textAlign = 'right';
        ctx.fillText(axes[i].label, x, y);
    }

    return canvas.toBuffer('image/png');
}
