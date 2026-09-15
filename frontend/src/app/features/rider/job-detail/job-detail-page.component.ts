import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { JobService } from '../../../core/services/job.service';

@Component({
  selector: 'app-job-detail-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './job-detail-page.component.html',
  styleUrl: './job-detail-page.component.css'
})
export class JobDetailPageComponent {
  jobCode = signal('');

  constructor(private route: ActivatedRoute, public jobService: JobService, private router: Router) {
    this.jobCode.set(this.route.snapshot.paramMap.get('jobCode') ?? '');
  }

  job = computed(() => this.jobService.getJobByCode(this.jobCode()));

  goNavigate(stopId: string) {
    this.router.navigate(['/rider/job', this.jobCode(), 'navigate', stopId]);
  }

  startJob() {
    if (this.job()?.stops.length) {
      this.goNavigate(this.job()!.stops[0].id);
    }
  }
}
