import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RoutePlanningService, RecalculateTarget } from '../../../core/services/route-planning.service';
import { MockMapComponent, MockMapMarker, MockMapRoute } from '../../../shared/mock-map/mock-map.component';
import { CheckBeforeCalculateModalComponent } from './check-before-calculate-modal.component';
import { RecalculateRouteModalComponent } from './recalculate-route-modal.component';

@Component({
  selector: 'app-route-planning-page',
  standalone: true,
  imports: [CommonModule, MockMapComponent, CheckBeforeCalculateModalComponent, RecalculateRouteModalComponent],
  templateUrl: './route-planning-page.component.html',
  styleUrl: './route-planning-page.component.css'
})
export class RoutePlanningPageComponent {
  showCheckModal = signal(false);
  showRecalculateModal = signal(false);

  constructor(public routeService: RoutePlanningService) {}

  mapMarkers = computed<MockMapMarker[]>(() => {
    const markers: MockMapMarker[] = [{ id: 'home', x: 50, y: 55, isHome: true }];
    this.routeService.routes().forEach(r => {
      markers.push({ id: r.riderId, x: r.markerPos.x, y: r.markerPos.y, color: r.color });
    });
    return markers;
  });

  mapRoutes = computed<MockMapRoute[]>(() =>
    this.routeService.routes().map(r => ({ color: r.color, points: r.path }))
  );

  onConfirmCalculate() {
    this.routeService.calculate();
    this.showCheckModal.set(false);
  }

  onConfirmRecalculate(payload: { target: RecalculateTarget; allowReassign: boolean }) {
    this.routeService.recalculate(payload.target, payload.allowReassign);
    this.showRecalculateModal.set(false);
  }
}
