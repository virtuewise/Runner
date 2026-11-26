import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { DispatcherQueueItem } from "../../domain/mission/network-operations-queries.ts";

const C={bg:"#090B0E",surface:"#11151A",raised:"#171D24",border:"#252D36",text:"#F4F6F8",muted:"#929DA8",orange:"#FF6A2A",green:"#8DD7B0",red:"#FF806B"};
function label(value:Readonly<Record<string,unknown>>):string{
  return [value.locality,value.addressLine,value.countryCode].filter(x=>typeof x==="string"&&x.length>0).join(" · ")||"Location pending";
}
function urgency(status:string):boolean{return ["safety_hold","customs_hold","disputed"].includes(status);}
function freshness(location:DispatcherQueueItem["runnerLocation"]):string{
  if(!location)return "NO FRESH CONSENTED FIX";
  const age=Math.max(0,Math.round((Date.now()-new Date(location.capturedAt).getTime())/1000));
  return `FIX ${age}s AGO · ±${Math.round(location.accuracyMetres)}m`;
}
export interface DispatcherCommandCentreProps{
  readonly items:readonly DispatcherQueueItem[];
  readonly loading:boolean;
  readonly error?:string|null;
  readonly onOpenMission:(missionId:string)=>void;
}
export function DispatcherCommandCentre(props:DispatcherCommandCentreProps){
  return <ScrollView style={styles.root} contentContainerStyle={styles.content}>
    <View style={styles.header}>
      <Text style={styles.eyebrow}>RUNNER NETWORK / OPERATIONS</Text>
      <Text style={styles.title}>COMMAND CENTRE</Text>
      <Text style={styles.subtitle}>A live operational picture built from authoritative mission, leg and offer state.</Text>
    </View>
    <View style={styles.summary}>
      <View><Text style={styles.summaryValue}>{props.items.length}</Text><Text style={styles.summaryLabel}>ACTIVE LEGS</Text></View>
      <View style={styles.summaryDivider}/>
      <View><Text style={styles.summaryValue}>{props.items.filter(x=>urgency(x.missionStatus)).length}</Text><Text style={styles.summaryLabel}>NEEDS ATTENTION</Text></View>
      <View style={styles.summaryDivider}/>
      <View><Text style={styles.summaryValue}>{props.items.filter(x=>x.runnerLocation!==null).length}</Text><Text style={styles.summaryLabel}>FRESH FIXES</Text></View>
    </View>
    {props.loading?<View style={styles.empty}><ActivityIndicator color={C.orange}/><Text style={styles.muted}>Loading operational queue…</Text></View>:null}
    {props.error?<View style={styles.error}><Text style={styles.errorText}>{props.error}</Text></View>:null}
    {!props.loading&&!props.error&&props.items.length===0?<View style={styles.empty}><Text style={styles.emptyTitle}>QUEUE CLEAR</Text><Text style={styles.muted}>No active mission legs require dispatch attention.</Text></View>:null}
    {props.items.map(item=><Pressable key={item.legId} accessibilityRole="button" onPress={()=>props.onOpenMission(item.missionId)} style={[styles.card,urgency(item.missionStatus)&&styles.priorityCard]}>
      <View style={styles.cardTop}>
        <Text style={styles.missionId}>MISSION {item.missionId.slice(0,8).toUpperCase()} · LEG {item.legNumber}</Text>
        {urgency(item.missionStatus)?<Text style={styles.alert}>PRIORITY REVIEW</Text>:<Text style={styles.status}>{item.missionStatus.replaceAll("_"," ").toUpperCase()}</Text>}
      </View>
      <Text style={styles.category}>{item.category.replaceAll("_"," ").toUpperCase()} · {item.legStatus.replaceAll("_"," ").toUpperCase()}</Text>
      <View style={styles.locations}><Text style={styles.location}>{label(item.pickup)}</Text><Text style={styles.arrow}>↓</Text><Text style={styles.location}>{label(item.destination)}</Text></View>
      <View style={styles.metadata}>
        <View style={styles.metaBlock}><Text style={styles.metaLabel}>RUNNER</Text><Text style={styles.metaValue}>{item.assignedRunnerId?item.assignedRunnerId.slice(0,8):"UNASSIGNED"}</Text></View>
        <View style={styles.metaBlock}><Text style={styles.metaLabel}>OFFER</Text><Text style={styles.metaValue}>{item.activeOfferStatus?.toUpperCase()??"NONE"}</Text></View>
      </View>
      <View style={styles.locationStatus}><View style={[styles.dot,item.runnerLocation?styles.liveDot:styles.noDot]}/><Text style={styles.locationStatusText}>{freshness(item.runnerLocation)}</Text></View>
    </Pressable>)}
  </ScrollView>;
}
const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:C.bg},content:{padding:20,gap:12,maxWidth:900,width:"100%",alignSelf:"center",paddingBottom:40},
 header:{paddingTop:20,paddingBottom:14,borderBottomWidth:1,borderBottomColor:C.border},
 eyebrow:{color:C.orange,fontSize:10,fontWeight:"900",letterSpacing:2},title:{color:C.text,fontSize:32,fontWeight:"900",letterSpacing:-1,marginTop:8},
 subtitle:{color:C.muted,fontSize:14,lineHeight:21,marginTop:8,maxWidth:600},
 summary:{flexDirection:"row",alignItems:"center",justifyContent:"space-around",padding:16,backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:4},
 summaryValue:{color:C.text,fontSize:24,fontWeight:"900"},summaryLabel:{color:C.muted,fontSize:8,fontWeight:"900",letterSpacing:1,marginTop:3},
 summaryDivider:{width:1,height:32,backgroundColor:C.border},
 card:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:4,padding:16,gap:10},
 priorityCard:{borderColor:"#8A3B2A"},cardTop:{flexDirection:"row",justifyContent:"space-between",gap:8,flexWrap:"wrap"},
 missionId:{color:C.muted,fontSize:9,fontWeight:"900",letterSpacing:1},alert:{color:C.red,fontSize:9,fontWeight:"900",letterSpacing:1},
 status:{color:C.green,fontSize:9,fontWeight:"900",letterSpacing:1},category:{color:C.orange,fontSize:9,fontWeight:"800",letterSpacing:1},
 locations:{backgroundColor:C.raised,padding:12,borderRadius:3},location:{color:C.text,fontSize:12,fontWeight:"600"},arrow:{color:C.orange,fontSize:13,marginVertical:4},
 metadata:{flexDirection:"row",gap:22},metaBlock:{gap:3},metaLabel:{color:C.muted,fontSize:8,fontWeight:"900",letterSpacing:1},metaValue:{color:C.text,fontSize:10,fontWeight:"800"},
 locationStatus:{flexDirection:"row",alignItems:"center",gap:7,borderTopWidth:1,borderTopColor:C.border,paddingTop:10},
 dot:{width:6,height:6,borderRadius:3},liveDot:{backgroundColor:C.green},noDot:{backgroundColor:C.muted},
 locationStatusText:{color:C.muted,fontSize:8,fontWeight:"900",letterSpacing:1},
 empty:{padding:28,alignItems:"center",gap:9,borderWidth:1,borderColor:C.border,backgroundColor:C.surface,borderRadius:4},
 emptyTitle:{color:C.text,fontSize:13,fontWeight:"900",letterSpacing:1.2},muted:{color:C.muted,fontSize:12,lineHeight:18,textAlign:"center"},
 error:{padding:14,borderWidth:1,borderColor:"#8A3B2A",backgroundColor:"#251713"},errorText:{color:"#FFB09A",fontSize:12},
});
