import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SidebarComponent } from './components/sidebar/sidebar.component'; // ปรับ path ให้ตรง

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  hideLayout = signal(this.readHideLayout());

  constructor() {
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe(() => this.hideLayout.set(this.readHideLayout()));
  }

  // ไล่ลงไปถึง route ลูกสุดท้ายที่ active
  private readHideLayout(): boolean {
    let r = this.route.snapshot;
    while (r.firstChild) r = r.firstChild;
    return !!r.data['hideLayout'];
  }
}