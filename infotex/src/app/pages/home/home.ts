import { Component, signal, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common'; // 👈 aquí

type Post = {
  id: number;
  title: string;
  author: string;
  avatarUrl: string;
  createdAt: Date;
  tags: string[];
  comments: number;
  reactions: number;
};

@Component({
  standalone: true,
  selector: 'app-home',
  templateUrl: './home.html',
  styleUrls: ['./home.css'],
  imports: [
    FormsModule, // 👈 para [(ngModel)]
    NgClass  // 👈 para [ngClass]
  ],
})
export class Home {
  loading = signal(false);
  error = signal<string | null>(null);
  posts = signal<Post[]>([]);
  command = signal('fetch posts');

  ngOnInit() { this.runCommand(); }

  runCommand() {
    const cmd = this.command().trim().toLowerCase();
    if (cmd.includes('fetch')) this.loadPosts();
    else if (cmd === 'clear') { this.posts.set([]); this.error.set(null); }
    else { this.error.set(`Comando no reconocido: "${cmd}"`); setTimeout(() => this.error.set(null), 1800); }
  }

  onCmdKeyDown(ev: KeyboardEvent) { if (ev.ctrlKey && ev.key === 'Enter') this.runCommand(); }

  private gPressed = false;
  @HostListener('document:keydown', ['$event'])
  handleKeydown(e: KeyboardEvent) { if (e.key.toLowerCase() === 'g') this.gPressed = true; if (this.gPressed && e.key.toLowerCase() === 'r') { e.preventDefault(); this.loadPosts(); this.gPressed = false; } }
  @HostListener('document:keyup', ['$event'])
  handleKeyup(e: KeyboardEvent) { if (e.key.toLowerCase() === 'g') this.gPressed = false; }

  async loadPosts() {
    this.loading.set(true); this.error.set(null);
    try { this.posts.set(await this.mockFetch()); }
    catch { this.error.set('Error al cargar posts.'); }
    finally { this.loading.set(false); }
  }

  private mockFetch(): Promise<Post[]> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const now = Date.now();
        resolve([
          { id:101,title:'Mejora: soporte de temas oscuros',author:'octocat',avatarUrl:'https://avatars.githubusercontent.com/u/583231?v=4',createdAt:new Date(now-1000*60*60*2),tags:['enhancement','ui'],comments:5,reactions:18 },
          { id:102,title:'Bug: overlay no respeta z-index',author:'hubber',avatarUrl:'https://avatars.githubusercontent.com/u/9919?v=4',createdAt:new Date(now-1000*60*60*26),tags:['bug'],comments:2,reactions:7 },
          { id:103,title:'Docs: guía rápida para CDK Dialog',author:'renag',avatarUrl:'https://avatars.githubusercontent.com/u/1?v=4',createdAt:new Date(now-1000*60*8),tags:['documentation','help wanted'],comments:0,reactions:3 },
        ]);
      }, 800);
    });
  }

  timeAgo(d: Date): string {
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    const units: [number, string][] = [[60,'s'],[60,'min'],[24,'h'],[7,'d'],[4.35,'sem'],[12,'mes']];
    let value = diff, label = 's';
    for (let i=0;i<units.length;i++){ if (value<units[i][0]) { label = units[i][1]; break; } value=Math.floor(value/units[i][0]); label=units[i][1]; }
    return `${value} ${label}`;
  }

  borderTag(tag: string) {
    const map: Record<string,string> = {
      bug:'badge-danger-subtle', enhancement:'badge-success-subtle',
      documentation:'badge-info-subtle', 'help wanted':'badge-warning-subtle', ui:'badge-secondary-subtle'
    };
    return map[tag] ?? 'badge-secondary-subtle';
  }
}
