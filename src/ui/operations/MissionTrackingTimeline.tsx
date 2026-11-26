import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { MissionTrackingView } from "../../domain/mission/network-operations-queries.ts";

const C={bg:"#090B0E",surface:"#11151A",raised:"#171D24",border:"#252D36",text:"#F4F6F8",muted:"#929DA8",orange:"#FF6A2A",green:"#8DD7B0"};
function place(value:Readonly<Record<string,unknown>>):string{
  return [value.locality,value.addressLine,value.countryCode].filter(x=>typeof x==="string"&&x.length>0).join(" · ")||"Location pending";
}
export interface MissionTrackingTimelineProps{readonly mission:MissionTrackingView;}
export function MissionTrackingTimeline({mission}:MissionTrackingTimelineProps){
  return <ScrollView style={styles.root} contentContainerStyle={styles.content}>
    <View style={styles.header}>
      <Text style={styles.eyebrow}>MISSION TRACKING / VERIFIED EVENTS</Text>
      <Text style={styles.title}>MISSION {mission.missionId.slice(0,8).toUpperCase()}</Text>
      <Text style={styles.status}>{mission.status.replaceAll("_"," ").toUpperCase()} · VERSION {mission.version}</Text>
    </View>
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>RELAY ROUTE</Text>
      {mission.legs.map((leg,index)=><View key={leg.legId} style={styles.leg}>
        <View style={styles.legRail}><View style={[styles.legDot,leg.status==="delivered"&&styles.completeDot]}/>{index<mission.legs.length-1?<View style={styles.legLine}/>:null}</View>
        <View style={styles.legBody}>
          <View style={styles.legTop}><Text style={styles.legTitle}>LEG {leg.legNumber}</Text><Text style={styles.legStatus}>{leg.status.replaceAll("_"," ").toUpperCase()}</Text></View>
          <Text style={styles.place}>{place(leg.origin)}</Text><Text style={styles.arrow}>↓</Text><Text style={styles.place}>{place(leg.destination)}</Text>
          {leg.runnerId?<Text style={styles.runner}>RUNNER {leg.runnerId.slice(0,8).toUpperCase()}</Text>:<Text style={styles.runner}>AWAITING ASSIGNMENT</Text>}
          {leg.location?<View style={styles.location}><Text style={styles.locationText}>CONSENTED LOCATION · ±{Math.round(leg.location.accuracyMetres)}m</Text><Text style={styles.locationText}>FIX {new Date(leg.location.capturedAt).toLocaleTimeString()}</Text></View>:null}
        </View>
      </View>)}
    </View>
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>AUDIT TIMELINE</Text>
      {mission.events.map(event=><View key={event.sequence} style={styles.event}>
        <View style={styles.eventMarker}/>
        <View style={styles.eventBody}><Text style={styles.eventType}>{event.type.replaceAll("."," / ").toUpperCase()}</Text>
          <Text style={styles.eventDate}>{new Date(event.occurredAt).toLocaleString()} · SEQ {event.sequence}</Text></View>
      </View>)}
      {mission.events.length===0?<Text style={styles.muted}>No mission events have been recorded yet.</Text>:null}
    </View>
    <Text style={styles.disclaimer}>Location is operational context only. Pickup, transfer and delivery require their own verified custody evidence.</Text>
  </ScrollView>;
}
const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:C.bg},content:{padding:20,gap:18,maxWidth:760,width:"100%",alignSelf:"center",paddingBottom:40},
 header:{paddingTop:20,paddingBottom:16,borderBottomWidth:1,borderBottomColor:C.border},
 eyebrow:{color:C.orange,fontSize:10,fontWeight:"900",letterSpacing:2},title:{color:C.text,fontSize:28,fontWeight:"900",letterSpacing:-.8,marginTop:8},
 status:{color:C.green,fontSize:9,fontWeight:"900",letterSpacing:1.2,marginTop:8},
 section:{gap:12},sectionTitle:{color:C.muted,fontSize:9,fontWeight:"900",letterSpacing:1.5},
 leg:{flexDirection:"row",gap:13},legRail:{width:12,alignItems:"center"},legDot:{width:10,height:10,borderRadius:5,borderWidth:2,borderColor:C.orange,marginTop:3},
 completeDot:{borderColor:C.green,backgroundColor:C.green},legLine:{width:1,flex:1,minHeight:150,backgroundColor:C.border},
 legBody:{flex:1,backgroundColor:C.surface,borderWidth:1,borderColor:C.border,padding:14,borderRadius:4,marginBottom:12,gap:6},
 legTop:{flexDirection:"row",justifyContent:"space-between",gap:8},legTitle:{color:C.text,fontSize:12,fontWeight:"900"},legStatus:{color:C.orange,fontSize:8,fontWeight:"900",letterSpacing:.7},
 place:{color:C.text,fontSize:12,fontWeight:"600"},arrow:{color:C.orange,fontSize:12},runner:{color:C.muted,fontSize:8,fontWeight:"900",letterSpacing:1,marginTop:4},
 location:{backgroundColor:C.raised,padding:9,marginTop:4,gap:3},locationText:{color:C.green,fontSize:8,fontWeight:"800",letterSpacing:.5},
 event:{flexDirection:"row",gap:10,alignItems:"flex-start",paddingVertical:9,borderBottomWidth:1,borderBottomColor:C.border},
 eventMarker:{width:7,height:7,borderRadius:4,backgroundColor:C.orange,marginTop:4},eventBody:{flex:1,gap:4},
 eventType:{color:C.text,fontSize:10,fontWeight:"800"},eventDate:{color:C.muted,fontSize:9},
 muted:{color:C.muted,fontSize:11},disclaimer:{color:C.muted,fontSize:10,lineHeight:16,borderTopWidth:1,borderTopColor:C.border,paddingTop:13},
});
