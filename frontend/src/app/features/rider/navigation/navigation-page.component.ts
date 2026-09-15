import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { JobService } from '../../../core/services/job.service';
import { MockMapComponent } from '../../../shared/mock-map/mock-map.component';

@Component({
  selector: 'app-navigation-page',
  standalone: true,
  imports: [CommonModule, RouterLink, MockMapComponent],
  templateUrl: './navigation-page.component.html',
  styleUrl: './navigation-page.component.css'
})
export class NavigationPageComponent {
  jobCode = signal('');
  stopId = signal('');

  constructor(private route: ActivatedRoute, public jobService: JobService, private router: Router) {
    this.jobCode.set(this.route.snapshot.paramMap.get('jobCode') ?? '');
    this.stopId.set(this.route.snapshot.paramMap.get('stopId') ?? '');
  }

  job = computed(() => this.jobService.getJobByCode(this.jobCode()));
  stop = computed(() => this.job()?.stops.find(s => s.id === this.stopId()));
  stopIndex = computed(() => this.job()?.stops.findIndex(s => s.id === this.stopId()) ?? -1);
  totalStops = computed(() => this.job()?.stops.length ?? 0);

  markDelivered() {
    this.jobService.markDelivered(this.jobCode(), this.stopId());
    this.router.navigate(['/rider/job', this.jobCode()]);
  }
}
