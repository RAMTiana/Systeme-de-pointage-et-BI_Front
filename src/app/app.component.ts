import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ThemeService } from './core/services/theme.service';
import { ThemeToggleComponent } from './shared/theme-toggle/theme-toggle.component';

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, ThemeToggleComponent],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'srb-frontend';

  // L'injection suffit à instancier le service dès le démarrage, afin que
  // l'écoute des changements de préférence système soit active même sur
  // l'écran de connexion, avant tout affichage du bouton de bascule.
  constructor(private readonly themeService: ThemeService) {}
}
