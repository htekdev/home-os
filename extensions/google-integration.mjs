/**
 * Home OS — Google Integration Extension
 * 
 * Provides Google Calendar, Gmail, and Maps integration.
 * Handles OAuth2 token management and API calls.
 * 
 * Tools exposed:
 * - gcal_today: Today's calendar events
 * - gcal_upcoming: Events for next N days
 * - gcal_create_event: Create a calendar event
 * - gmail_search: Search emails
 * - gmail_unread_count: Count unread emails
 * - get_drive_time: Drive time between locations
 * - get_directions: Turn-by-turn directions
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const DATA_DIR = process.env.HOMEOS_DATA_DIR || join(process.cwd(), 'data');
const TOKEN_PATH = join(DATA_DIR, 'google-tokens.json');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY;

// --- Token Management ---

function loadTokens() {
  if (!existsSync(TOKEN_PATH)) return null;
  return JSON.parse(readFileSync(TOKEN_PATH, 'utf-8'));
}

function saveTokens(tokens) {
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
}

async function getAccessToken() {
  const tokens = loadTokens();
  if (!tokens) throw new Error('Google not authenticated. Run setup first.');

  // Check if token is expired
  if (tokens.expiry_date && Date.now() >= tokens.expiry_date) {
    // Refresh the token
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: tokens.refresh_token,
        grant_type: 'refresh_token'
      })
    });
    const data = await response.json();
    tokens.access_token = data.access_token;
    tokens.expiry_date = Date.now() + (data.expires_in * 1000);
    saveTokens(tokens);
  }

  return tokens.access_token;
}

// --- Google Calendar ---

export async function gcalToday() {
  const token = await getAccessToken();
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${startOfDay}&timeMax=${endOfDay}&singleEvents=true&orderBy=startTime`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json();

  return (data.items || []).map(event => ({
    id: event.id,
    summary: event.summary,
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    location: event.location || '',
    description: event.description || ''
  }));
}

export async function gcalUpcoming({ days } = {}) {
  const token = await getAccessToken();
  const lookAhead = days || 7;
  const now = new Date().toISOString();
  const future = new Date(Date.now() + lookAhead * 24 * 60 * 60 * 1000).toISOString();

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now}&timeMax=${future}&singleEvents=true&orderBy=startTime`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json();

  return (data.items || []).map(event => ({
    id: event.id,
    summary: event.summary,
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    location: event.location || ''
  }));
}

export async function gcalCreateEvent({ summary, start, end, location, description, attendees, recurrence }) {
  const token = await getAccessToken();
  const event = {
    summary,
    start: { dateTime: start, timeZone: process.env.HOMEOS_TIMEZONE || 'America/Chicago' },
    end: { dateTime: end, timeZone: process.env.HOMEOS_TIMEZONE || 'America/Chicago' },
    location: location || undefined,
    description: description || undefined,
    attendees: attendees ? attendees.split(',').map(e => ({ email: e.trim() })) : undefined,
    recurrence: recurrence ? [`RRULE:FREQ=${recurrence}`] : undefined
  };

  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(event)
  });

  const data = await response.json();
  return { success: !data.error, id: data.id, link: data.htmlLink, summary: data.summary };
}

// --- Gmail ---

export async function gmailSearch({ query, maxResults }) {
  const token = await getAccessToken();
  const max = maxResults || 10;
  const url = `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${max}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json();

  if (!data.messages) return [];

  const messages = [];
  for (const msg of data.messages.slice(0, 5)) { // Limit full reads to 5
    const detail = await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const d = await detail.json();
    const headers = d.payload?.headers || [];
    messages.push({
      id: msg.id,
      threadId: msg.threadId,
      subject: headers.find(h => h.name === 'Subject')?.value || '',
      from: headers.find(h => h.name === 'From')?.value || '',
      date: headers.find(h => h.name === 'Date')?.value || '',
      snippet: d.snippet || ''
    });
  }
  return messages;
}

export async function gmailUnreadCount() {
  const token = await getAccessToken();
  const url = 'https://www.googleapis.com/gmail/v1/users/me/labels/INBOX';
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json();
  return { unread: data.messagesUnread || 0, total: data.messagesTotal || 0 };
}

// --- Google Maps ---

export async function getDriveTime({ origin, destination }) {
  if (!GOOGLE_MAPS_KEY) return { error: 'GOOGLE_MAPS_API_KEY not configured' };

  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&key=${GOOGLE_MAPS_KEY}&departure_time=now`;
  const response = await fetch(url);
  const data = await response.json();

  const element = data.rows?.[0]?.elements?.[0];
  if (!element || element.status !== 'OK') return { error: 'Could not calculate route' };

  return {
    origin,
    destination,
    distance: element.distance?.text,
    duration: element.duration?.text,
    duration_in_traffic: element.duration_in_traffic?.text
  };
}

export async function getDirections({ origin, destination, waypoints }) {
  if (!GOOGLE_MAPS_KEY) return { error: 'GOOGLE_MAPS_API_KEY not configured' };

  let url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&key=${GOOGLE_MAPS_KEY}`;
  if (waypoints) {
    url += `&waypoints=${encodeURIComponent(waypoints)}`;
  }

  const response = await fetch(url);
  const data = await response.json();
  const route = data.routes?.[0];
  if (!route) return { error: 'No route found' };

  return {
    summary: route.summary,
    distance: route.legs.reduce((sum, l) => sum + l.distance.value, 0),
    duration: route.legs.reduce((sum, l) => sum + l.duration.value, 0),
    steps: route.legs.flatMap(l => l.steps.map(s => ({
      instruction: s.html_instructions?.replace(/<[^>]*>/g, ''),
      distance: s.distance?.text,
      duration: s.duration?.text
    })))
  };
}
