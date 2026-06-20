import { useState, useEffect, useMemo } from 'react';
import { articlesByCategory, categories } from './manifest.js';

// Fetch a .md article file from public/help-docs/
export async function fetchArticle(file) {
  const res = await fetch(`/help-docs/${file}`);
  if (!res.ok) throw new Error(`Failed to load ${file}`);
  return res.text();
}

// Build flat list of all articles for search
export function getAllArticles() {
  const all = [];
  for (const cat of categories) {
    for (const article of articlesByCategory[cat] || []) {
      all.push({ ...article, category: cat });
    }
  }
  return all;
}

// Search articles by query string
export function searchArticles(query) {
  if (!query || query.trim().length < 2) return [];
  const q = query.toLowerCase().trim();
  const all = getAllArticles();
  return all.filter(a =>
    a.title.toLowerCase().includes(q) ||
    a.category.toLowerCase().includes(q) ||
    a.slug.toLowerCase().includes(q)
  );
}

// Find article by slug
export function findArticleBySlug(slug) {
  const all = getAllArticles();
  return all.find(a => a.slug === slug) || null;
}

// Find article by file name
export function findArticleByFile(file) {
  const all = getAllArticles();
  return all.find(a => a.file === file) || null;
}

// Get related articles (next/prev in same category, or from all)
export function getRelatedArticles(article, count = 3) {
  const all = getAllArticles();
  const sameCat = all.filter(a => a.category === article.category && a.id !== article.id);
  const others = all.filter(a => a.category !== article.category && a.id !== article.id);
  const related = [...sameCat.slice(0, count), ...others.slice(0, count - sameCat.length)].slice(0, count);
  return related;
}
