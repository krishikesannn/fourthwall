-- Local screenshot/review data only. Never apply this file to production.
-- Requires the local owner/client/project created by the documented review setup.
insert or ignore into inquiries(id,name,email,company,service,details,source,status)
values
 ('demo-lead-1','Mira Kapoor','mira@atelier.local','Atelier Mira','Brand identity','A refined identity for a slow-fashion label.','Website','new'),
 ('demo-lead-2','Kabir Shah','kabir@north.local','North House','Editorial website','A portfolio and editorial commerce experience.','Referral','qualified'),
 ('demo-lead-3','Rhea Menon','rhea@field.local','Field Notes','Social media','A launch campaign and content system.','Instagram','contacted');

insert or ignore into lead_activities(id,inquiry_id,kind,note,follow_up_at,created_by)
values ('demo-lead-note','demo-lead-2','note','Discovery call went well. Send the positioning workshop outline.','2026-09-18','5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89');

insert or ignore into project_updates(id,project_id,title,body,visible_to_client,requires_approval,created_by,scheduled_at)
values
 ('demo-update-1','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','Identity direction ready','The primary identity route is ready for a focused review.',1,1,'5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89',null),
 ('demo-update-2','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','Strategy workshop complete','We aligned the audience, position and core brand promise.',1,0,'5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89',null),
 ('demo-update-3','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','Launch note scheduled','This update will appear when the launch assets are ready.',1,0,'5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89','2026-10-18T09:30:00.000Z');

insert or ignore into milestones(id,project_id,title,due_date,status,waiting_on,created_by)
values
 ('demo-milestone-1','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','Approve identity direction','2026-09-24','active','client','5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89'),
 ('demo-milestone-2','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','Website content handoff','2026-10-12','upcoming','studio','5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89');

insert or ignore into project_tasks(id,project_id,title,assignee_id,due_date,status,waiting_on_client,created_by)
values
 ('demo-task-1','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','Refine primary wordmark','5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89','2026-09-19','doing',0,'5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89'),
 ('demo-task-2','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','Collect final product copy','5d6a80f1-3c9b-425e-8252-3961a21236e1','2026-09-22','todo',1,'5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89');

insert or ignore into project_messages(id,project_id,body,sender_id)
values
 ('demo-message-1','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','The warmer colour direction feels exactly right.','5d6a80f1-3c9b-425e-8252-3961a21236e1'),
 ('demo-message-2','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','Perfect — we will carry that warmth into the launch system.','5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89');

insert or ignore into project_files(id,project_id,storage_path,file_name,mime_type,size_bytes,version,uploaded_by)
values
 ('demo-file-1','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','demo/concept-board.jpg','Saffron-concept-board.jpg','image/jpeg',842000,2,'5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89'),
 ('demo-file-2','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','demo/brand-guide.pdf','Saffron-brand-guide.pdf','application/pdf',1450000,1,'5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89');

insert or ignore into moodboards(id,project_id,title,file_id,note,created_by)
values ('demo-board-1','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','Warm editorial direction','demo-file-1','Natural materials, quiet typography and a confident saffron accent.','5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89');
insert or ignore into moodboard_reactions(moodboard_id,user_id,reaction)
values ('demo-board-1','5d6a80f1-3c9b-425e-8252-3961a21236e1','love');

insert or ignore into design_comments(id,project_id,file_id,page_number,pin_x,pin_y,body,created_by)
values
 ('demo-comment-1','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','demo-file-1',1,67,31,'Could this mark feel slightly more organic?','5d6a80f1-3c9b-425e-8252-3961a21236e1'),
 ('demo-comment-2','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','demo-file-1',1,null,null,'Yes — we are softening the terminal shapes in the next version.','5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89');
update design_comments set parent_id='demo-comment-1' where id='demo-comment-2';

insert or ignore into content_posts(id,project_id,title,channel,publish_at,caption,status,created_by)
values
 ('demo-post-1','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','Meet Saffron House','Instagram','2026-09-17T10:00:00.000Z','A slower, warmer way to dress.','in_review','5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89'),
 ('demo-post-2','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','Founder story','LinkedIn','2026-09-23T09:00:00.000Z','The thinking behind the label.','scheduled','5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89'),
 ('demo-post-3','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','Material journal','Instagram','2026-09-29T12:00:00.000Z','From fibre to finished form.','draft','5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89');

insert or ignore into brand_assets(id,project_id,file_id,kind,name,version,is_latest,created_by)
values
 ('demo-asset-logo','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','demo-file-1','logo','Primary logo suite',2,1,'5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89'),
 ('demo-asset-guide','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','demo-file-2','template','Brand guideline PDF',1,1,'5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89');
insert or ignore into brand_assets(id,project_id,kind,name,token_value,version,is_latest,created_by)
values
 ('demo-asset-color-1','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','color','Evergreen','#0E3832',1,1,'5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89'),
 ('demo-asset-color-2','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','color','Antique gold','#B89246',1,1,'5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89');

insert or ignore into brand_guidelines(id,project_id,title,content,sort_order,created_by)
values
 ('demo-guide-1','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','Brand idea','Saffron House makes considered clothing feel personal, tactile and quietly modern.',1,'5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89'),
 ('demo-guide-2','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','Voice','Warm, direct and observant. Never rushed, ornamental or overly polished.',2,'5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89'),
 ('demo-guide-3','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','Colour','Evergreen grounds the system; antique gold marks moments of emphasis.',3,'5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89');

insert or ignore into invoices(id,project_id,invoice_number,currency,subtotal,tax,total,status,source,due_date,created_by)
values
 ('demo-invoice-1','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','TFW-2026-014','INR',8500000,1530000,10030000,'sent','fixed','2026-09-25','5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89'),
 ('demo-invoice-2','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','TFW-2026-008','INR',7500000,1350000,8850000,'paid','fixed','2026-08-18','5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89');
insert or ignore into invoice_items(id,invoice_id,description,quantity,unit_amount,sort_order)
values ('demo-item-1','demo-invoice-1','Visual identity — second milestone',1,8500000,1);

insert or ignore into proposals(id,project_id,title,introduction,currency,total,status,created_by)
values ('demo-proposal-1','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','Saffron House launch partnership','A considered identity and editorial launch system.','INR',30500000,'sent','5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89');
insert or ignore into proposal_blocks(id,proposal_id,title,description,amount,sort_order)
values
 ('demo-block-1','demo-proposal-1','Brand strategy','Positioning, audience and verbal direction.',7500000,1),
 ('demo-block-2','demo-proposal-1','Visual identity','Identity system and practical guidelines.',12500000,2),
 ('demo-block-3','demo-proposal-1','Editorial website','Responsive design and development.',10500000,3);

insert or ignore into meetings(id,project_id,title,starts_at,duration_minutes,status,meeting_provider,join_url,calendar_event_id,booked_by)
values ('demo-meeting-1','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','Identity review','2026-09-18T10:30:00.000Z',45,'confirmed','google_calendar','https://meet.google.com/demo-review','demo-calendar-event','5d6a80f1-3c9b-425e-8252-3961a21236e1');

insert or ignore into time_entries(id,project_id,user_id,description,started_at,stopped_at,minutes)
values
 ('demo-time-1','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89','Identity refinements','2026-09-08T09:00:00Z','2026-09-08T11:45:00Z',165),
 ('demo-time-2','5b123f6a-80f9-4d4c-ac6b-c5213b524d20','5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89','Website art direction','2026-09-09T08:30:00Z','2026-09-09T10:30:00Z',120);

insert or ignore into client_contacts(id,user_id,name,email,company,key_date,renewal_at,notes,created_by)
values ('demo-contact-1','5d6a80f1-3c9b-425e-8252-3961a21236e1','Anika Rao','client@saffron.local','Saffron House','2026-03-11','2027-08-30','Prefers Tuesday review calls.','5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89');
insert or ignore into update_templates(id,name,title,body,created_by)
values ('demo-template-1','Review ready','A new direction is ready','We have prepared the next stage for your review. Please add comments directly to the latest file.','5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89');
insert or ignore into announcements(id,title,body,created_by)
values ('demo-announcement-1','Studio note','The studio will be closed for a short autumn break from 2–4 October.','5669d2a6-20c9-4dd2-b1df-6fd07c1e0c89');
insert or ignore into studio_branding(id,studio_name,accent_color,email_footer)
values (1,'The Fourth Wall','#B89246','Editorial branding and digital studio · thefourthwall04.co@gmail.com');
