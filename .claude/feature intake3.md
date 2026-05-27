# Golf App Claude Build Prompt Pack

This file contains high priority feature prompts for extending my golf leaderboard app into a social competition platform.

The goal is to increase retention, social interaction, and real world usage during golf rounds and golf trips.

Stack context:
Next.js frontend  
Postgres database via Supabase pooler  
Existing features include user auth, rounds, scores, leaderboards, stats, and weather integration  

---

# 1 Live Round Mode

Build a live round mode for my golf app.

Requirements:
• Real time leaderboard updates during a round  
• Current hole tracking for each player  
• Relative to par display per player  
• Mini game standings update during play  
• Automatic UI updates without page refresh  
• Optimistic UI score updates  
• Large touch friendly controls for mobile use  
• Sticky bottom score entry area  
• Support for 9 hole and 18 hole rounds  
• Highlight leaderboard position changes with animations  
• Show current leader clearly at all times  
• Proper tie handling in rankings  
• Minimal taps required to enter scores during play  

Please provide:
1 Database changes if needed  
2 API design  
3 Frontend component structure  
4 Live update strategy  
5 Mobile user experience improvements  
6 Step by step implementation plan  

Focus on simplicity, speed, and social competitiveness over deep analytics  

---

# 2 QR Code Event Joining

Add QR code based event joining for golf outings and groups.

Requirements:
• Each event or outing has a unique invite code  
• Generate QR codes that open a join screen on mobile  
• Extremely fast join flow with minimal steps  
• Support public and private events  
• Expiring invite links for security  
• Admin ability to revoke invites  
• Camera based QR scanning on mobile  
• Deep link support when app is installed  
• Web fallback when app is not installed  
• Secure against guessing or spam joins  

Please design:
1 Database schema additions  
2 Invite token system  
3 API endpoints  
4 QR code generation flow  
5 Mobile join experience  
6 Security considerations  
7 Simple UI layout ideas  

Goal is frictionless event joining in under a few seconds  

---

# 3 Social Activity Feed

Design a social activity feed for my golf app.

The feed should show automatically generated golf events such as:
• Round wins  
• Birdies  
• Career best rounds  
• Closest to pin wins  
• Leaderboard changes  
• Winning streaks  
• Rivalry updates  
• Mini game results  
• Event victories  

Requirements:
• Mobile first feed design  
• Infinite scroll loading  
• Efficient performance with caching  
• Human readable event messages  
• Time grouping such as 2 hours ago  
• Filtering by group, friends, or events  
• Optional reactions and comments  
• Prevent duplicate spam events  

Please provide:
1 Event system architecture  
2 Feed database structure  
3 Backend event generation strategy  
4 Feed ranking logic  
5 Caching strategy  
6 Example event formats  
7 User experience recommendations  

Goal is to make the app feel active even when users are not playing  

---

# 4 AI Round Recaps

Add AI generated round recaps for completed golf rounds.

Input data available:
• Hole by hole scores  
• Final leaderboard results  
• Mini game outcomes  
• Weather conditions  
• Player names  
• Course information  
• Round date  

Requirements:
• Funny and competitive recap styles  
• Short and mobile friendly output  
• Multiple tone options such as dramatic or comedic  
• Low cost per generation  
• Cache recaps after creation  
• Asynchronous generation after round completion  
• Retry handling for failures  
• Safe content handling  
• Shareable output format  

Please provide:
1 Prompt design strategy  
2 Backend architecture  
3 Database changes  
4 Async processing approach  
5 Example prompts  
6 Example outputs  
7 Cost reduction strategies  

Tone should feel like sports media mixed with friendly trash talk  

---

# 5 Mini Game Engine

Design a mini game engine for my golf app.

Games to support:
• Skins  
• Closest to pin  
• Poker  
• Wolf  
• Vegas  
• Match play  
• Nassau  

Requirements:
• Flexible system for adding new games  
• Hole by hole scoring logic  
• Support for solo and team formats  
• Live scoring updates during play  
• Automatic payout calculations  
• Tie handling rules  
• Custom rules per event  
• Admin controls for game settings  

Please provide:
1 Database design  
2 Scoring engine structure  
3 Type definitions  
4 API design  
5 Update strategy during play  
6 Extensibility approach  
7 User interface recommendations  

Goal is a reusable engine that supports many golf side games without rewriting core logic  