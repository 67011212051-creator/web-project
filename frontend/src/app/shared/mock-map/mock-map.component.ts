import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface MockMapMarker {
  id: string | number;
  x: number; // percent 0-100
  y: number; // percent 0-100
  color?: string;
  isHome?: boolean;
}

export interface MockMapRoute {
  color: string;
  points: { x: number; y: number }[];
}

@Component({
  selector: 'app-mock-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mock-map.component.html',
  styleUrl: './mock-map.component.css'
})
export class MockMapComponent {
  @Input() markers: MockMapMarker[] = [];
  @Input() routes: MockMapRoute[] = [];
  @Input() radiusCircle = false;
  @Input() height = '320px';

  pointsToSvg(points: { x: number; y: number }[]): string {
    return points.map(p => `${p.x},${p.y}`).join(' ');
  }
}
