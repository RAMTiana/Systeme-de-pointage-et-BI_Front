import { CommonModule } from '@angular/common';
import { Component, computed } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';

interface NavItem {
  lien: string;
  icone: string;
  libelle: string;
  permissionRequise?: string;
}

interface NavGroup {
  libelle: string;
  items: NavItem[];
}

@Component({
    selector: 'app-shell',
    imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
    templateUrl: './shell.component.html',
    styleUrl: './shell.component.scss'
})
export class ShellComponent {
  menuOuvert = false;

  readonly groupesNav: NavGroup[] = [
    {
      libelle: 'Pilotage',
      items: [{ lien: '/tableau-de-bord', icone: 'ti-chart-bar', libelle: 'Tableau de bord', permissionRequise: 'consulter_bi' }],
    },
    {
      libelle: 'Opérations',
      items: [
        { lien: '/agents', icone: 'ti-users', libelle: 'Agents' },
        { lien: '/divisions', icone: 'ti-building', libelle: 'Divisions' },
        { lien: '/pointage', icone: 'ti-clock', libelle: 'Pointage' },
        { lien: '/pointage/scan', icone: 'ti-scan', libelle: 'Poste de scan' },
        { lien: '/anomalies', icone: 'ti-alert-triangle', libelle: 'Anomalies' },
        { lien: '/rapports', icone: 'ti-file-report', libelle: 'Rapports' },
      ],
    },
    {
      libelle: 'Administration',
      items: [
        { lien: '/utilisateurs', icone: 'ti-shield-lock', libelle: 'Utilisateurs & rôles', permissionRequise: 'valider_roles' },
        { lien: '/parametres', icone: 'ti-settings', libelle: 'Paramètres', permissionRequise: 'valider_roles' },
      ],
    },
  ];

  constructor(readonly authService: AuthService) {}

  readonly initiales = computed(() => {
    const nom = this.authService.utilisateur()?.nom_complet ?? '';
    return nom
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((mot) => mot[0]?.toUpperCase())
      .join('');
  });

  itemVisible(item: NavItem): boolean {
    return !item.permissionRequise || this.authService.hasPermission(item.permissionRequise);
  }

  basculerMenu(): void {
    this.menuOuvert = !this.menuOuvert;
  }

  fermerMenu(): void {
    this.menuOuvert = false;
  }

  seDeconnecter(): void {
    this.authService.deconnexion();
  }
}
