import 'package:flutter/material.dart';

import '../core/portails.dart';

/// Logo de l'établissement s'il est partenaire ; sinon icône hôpital générique.
class LogoEtablissement extends StatelessWidget {
  const LogoEtablissement(this.e, {super.key, this.taille = 46, this.surFond = false});
  final Etablissement e;
  final double taille;
  final bool surFond;

  @override
  Widget build(BuildContext context) {
    final rayon = BorderRadius.circular(taille * 0.26);
    final generique = Container(
      width: taille,
      height: taille,
      decoration: BoxDecoration(
        color: surFond ? Colors.white : e.teinte.withValues(alpha: 0.12),
        borderRadius: rayon,
      ),
      child: Icon(Icons.local_hospital_rounded, color: e.teinte, size: taille * 0.56),
    );
    final logo = e.logo;
    if (logo == null) return generique;
    return Container(
      width: taille,
      height: taille,
      padding: EdgeInsets.all(taille * 0.08),
      decoration: BoxDecoration(color: Colors.white, borderRadius: rayon, border: Border.all(color: const Color(0xFFE3E7E1))),
      child: ClipRRect(
        borderRadius: rayon,
        child: Image.network(logo, fit: BoxFit.contain, errorBuilder: (_, _, _) => Icon(Icons.local_hospital_rounded, color: e.teinte)),
      ),
    );
  }
}
