import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Music Discographies',
    loadComponent: () => import('./pages/artist-list/artist-list').then((m) => m.ArtistListPage),
  },
  {
    path: 'artist/:id',
    title: 'Artist | Music Discographies',
    loadComponent: () =>
      import('./pages/artist-detail/artist-detail').then((m) => m.ArtistDetailPage),
  },
  {
    path: '**',
    title: 'Page not found | Music Discographies',
    loadComponent: () => import('./pages/not-found/not-found').then((m) => m.NotFoundPage),
  },
];
